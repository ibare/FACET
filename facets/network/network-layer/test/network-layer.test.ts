// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  barsOf,
  finishOf,
  headerTotals,
  networkLayerAlgorithm,
  networkLayerFacet,
  networkLayerImperativeIR,
  networkLayerStageView,
  type NetworkLayerData,
  type NetworkLayerStage,
} from '../src/index.js';

const data = networkLayerFacet.initialData as NetworkLayerData;
const clone = (): NetworkLayerData => JSON.parse(JSON.stringify(data)) as NetworkLayerData;

/** 사양 실측표 — 끝 시각 (바이트 시간) · 틱 */
const TABLE: Record<number, Record<number, [number, number]>> = {
  1: { 1: [1, 1258], 2: [2, 1316], 3: [3, 1374], 4: [4, 1432], 6: [6, 1548], 12: [12, 1896] },
  2: { 1: [2, 2516], 2: [3, 1974], 3: [4, 1832], 4: [5, 1790], 6: [7, 1806], 12: [13, 2054] },
  3: { 1: [3, 3774], 2: [4, 2632], 3: [5, 2290], 4: [6, 2148], 6: [8, 2064], 12: [14, 2212] },
  5: { 1: [5, 6290], 2: [6, 3948], 3: [7, 3206], 4: [8, 2864], 6: [10, 2580], 12: [16, 2528] },
};
const FASTEST: Record<number, number> = { 1: 1, 2: 4, 3: 6, 5: 12 };
const HEADER_BYTES: Record<number, number> = { 1: 58, 2: 116, 3: 174, 4: 232, 6: 348, 12: 696 };
const SHARE: Record<number, number> = { 1: 95, 2: 91, 3: 87, 4: 84, 6: 78, 12: 63 };

function segmentsOf(action: string): number[] {
  const bar = networkLayerFacet.blocks['controls'] as { controls: { action: string; segments?: { value: number }[] }[] };
  const c = bar.controls.find((x) => x.action === action);
  if (!c?.segments) throw new Error(`손잡이 ${action} 없음`);
  return c.segments.map((s) => s.value);
}

type Run = { events: FacetRuntimeEvent[]; metrics: Map<string, number>; snapshots: Map<string, number>[] };

/** 손잡이 입력을 차례로 먹이며 판마다 끝의 계기를 떠 둔다 */
async function play(inputs: { type: string; value: number }[]): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const snapshots: Map<string, number>[] = [];
  const queue = [...inputs];
  const ctx = {
    data: clone(),
    cancelled: false,
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !ctx.cancelled;
    },
    async waitForInput() {
      snapshots.push(new Map(metrics));
      const next = queue.shift();
      if (!next) {
        ctx.cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value, segmentIndex: 0 } };
    },
    pollInput() {
      return null;
    },
  };
  await networkLayerAlgorithm(ctx as never);
  return { events, metrics, snapshots };
}

describe('networkLayer', () => {
  it('사다리가 손잡이 구간과 같고 데이터 크기가 사양대로다', () => {
    expect(data.splits).toEqual(segmentsOf('split'));
    expect(data.linkCounts).toEqual(segmentsOf('links'));
    expect(data.splits[data.splits.length - 1]).toBe(12);
    expect(data.linkCounts[data.linkCounts.length - 1]).toBe(5);
    expect(data.nodes).toHaveLength(6);
    const { head, tail } = headerTotals(data.layers);
    expect(head + tail).toBe(58);
    expect(100 + head + tail).toBe(158); // layer-wraps-payload
  });

  it('모든 조합에서 IR 의 끝 시각 = algorithm 의 끝 시각 = 사양 표', () => {
    const { head, tail } = headerTotals(data.layers);
    let combos = 0;
    let maxMid = 0;
    for (const L of data.linkCounts) {
      for (const n of data.splits) {
        const r = finishOf(data.message, head + tail, n, L);
        const ir = runIR(networkLayerImperativeIR, 'finishTime', [
          new Array<number>(n).fill(0),
          new Array<number>(n).fill(0),
          n,
          L,
          data.message,
          head + tail,
        ]);
        const want = TABLE[L]?.[n];
        expect(want).toBeDefined();
        expect(r.ticks).toBe(want?.[0]);
        expect(r.finish).toBe(want?.[1]);
        expect(ir).toBe(r.finish);
        expect(r.finish).toBe((L + n - 1) * (data.message / n + 58));
        maxMid = Math.max(maxMid, r.finish);
        combos += 1;
      }
      expect(barsOf(data, L).fastestSplit).toBe(FASTEST[L]);
    }
    expect(combos).toBe(24);
    expect(maxMid).toBe(6290);
  });

  it('hop-by-hop 3 · 3 과 n=4 · L=3 의 틱 차례를 재현한다', async () => {
    const run = await play([
      { type: 'split', value: 3 },
      { type: 'split', value: 4 },
    ]);
    const rounds: FacetRuntimeEvent[][] = [];
    for (const e of run.events) {
      if (e.type === 'round') rounds.push([]);
      if (e.type === 'forward') rounds[rounds.length - 1]?.push(e);
    }
    const busy = (r: FacetRuntimeEvent[] | undefined) => (r ?? []).map((e) => (e.payload as { busyLinks: number }).busyLinks);
    expect(busy(rounds[1])).toEqual([1, 2, 3, 2, 1]);
    expect(busy(rounds[2])).toEqual([1, 2, 3, 3, 2, 1]);
    const elapsed = (rounds[2] ?? []).map((e) => (e.payload as { elapsed: number }).elapsed);
    expect(elapsed).toEqual([358, 716, 1074, 1432, 1790, 2148]);
    const t3 = (rounds[2]?.[2]?.payload as { moves: { piece: number; from: number }[] }).moves;
    expect(t3).toEqual([
      { piece: 1, from: 2, to: 3 },
      { piece: 2, from: 1, to: 2 },
      { piece: 3, from: 0, to: 1 },
    ]);
  });

  it('회차별 계기 — 손잡이 A → B → A 로 돌려 회차마다 사양 표와 같다', async () => {
    // 기본 n=1 · L=3 → n=12 → L=5 → L=3 → n=1
    const run = await play([
      { type: 'split', value: 12 },
      { type: 'links', value: 5 },
      { type: 'links', value: 3 },
      { type: 'split', value: 1 },
    ]);
    const expected: [number, number][] = [
      [1, 3],
      [12, 3],
      [12, 5],
      [12, 3],
      [1, 3],
    ];
    expect(run.snapshots).toHaveLength(expected.length);
    expected.forEach(([n, L], i) => {
      const m = run.snapshots[i] as Map<string, number>;
      expect(m.get('header-bytes')).toBe(HEADER_BYTES[n]);
      expect(m.get('payload-share')).toBe(SHARE[n]);
      expect(m.get('elapsed-time')).toBe(TABLE[L]?.[n]?.[1]);
    });
    const steps = run.events.filter((e) => e.type === 'round' || e.type === 'forward' || e.type === 'finish').length;
    // 걸음 수 = 틱 + 2 의 합
    expect(steps).toBe((3 + 2) + (14 + 2) + (16 + 2) + (14 + 2) + (3 + 2));
  });

  it('사다리 밖 값과 남의 입력은 흘린다', async () => {
    const run = await play([
      { type: 'split', value: 5 },
      { type: 'other', value: 2 },
      { type: 'links', value: 4 },
    ]);
    expect(run.events.filter((e) => e.type === 'round')).toHaveLength(1);
  });

  it('stage 는 mountView 로 붙고 initialData 없이도 선다', () => {
    const host = document.createElement('div');
    const inst = mountView(networkLayerStageView, host, { config: {} }) as unknown as NetworkLayerStage;
    expect(typeof inst.showRound).toBe('function');
    inst.destroy();
  });
});

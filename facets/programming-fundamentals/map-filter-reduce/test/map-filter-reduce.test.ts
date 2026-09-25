// @vitest-environment happy-dom
/**
 * map-filter-reduce 고유의 주장 — 사양 표 대조 · IR ↔ algorithm 전 조합 · 회차별 계기 · 사다리.
 * 공통분(손잡이가 닿는가 · 덮이는 phase · 계기 누적 · transpiler)은 whole-check 가 한다.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  mapFilterReduceAlgorithm,
  mapFilterReduceFacet,
  mapFilterReduceImperativeIR,
  mapFilterReduceStageView,
  type MapFilterReduceData,
  type MapFilterReduceStage,
} from '../src/index.js';

const data = mapFilterReduceFacet.initialData as unknown as MapFilterReduceData;

/** 사양 표 (sim.py map-filter-reduce) */
const TABLE: Record<number, { kept: number[]; dropped: number[]; squares: number[]; sum: number; steps: number; lost: number[] }> = {
  0: { kept: [6, 3, 8, 1, 5, 9], dropped: [], squares: [36, 9, 64, 1, 25, 81], sum: 216, steps: 20, lost: [] },
  2: { kept: [6, 3, 8, 5, 9], dropped: [1], squares: [36, 9, 64, 25, 81], sum: 215, steps: 18, lost: [1] },
  4: { kept: [6, 8, 5, 9], dropped: [3, 1], squares: [36, 64, 25, 81], sum: 206, steps: 16, lost: [3] },
  6: { kept: [8, 9], dropped: [6, 3, 1, 5], squares: [64, 81], sum: 145, steps: 12, lost: [6, 5] },
  8: { kept: [9], dropped: [6, 3, 8, 1, 5], squares: [81], sum: 81, steps: 10, lost: [8] },
};

type Round = { events: FacetRuntimeEvent[]; steps: number; metrics: Map<string, number> };

/** 알고리즘을 돌려 판마다 모은다. 걸음 = sleep 수 + 판 끝의 입력 대기 하나. */
async function drive(inputs: number[], first?: number): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let cur: Round = { events: [], steps: 0, metrics: totals };
  const queue = [...inputs];
  let cancelled = false;
  let done!: () => void;
  const finished = new Promise<void>((r) => (done = r));
  const ctx = {
    data: { ...structuredClone(data), ...(first === undefined ? {} : { threshold: first }) },
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent) {
      cur.events.push(e);
    },
    async sleep() {
      cur.steps++;
      return !cancelled;
    },
    async waitForInput() {
      cur.steps++;
      rounds.push({ ...cur, metrics: new Map(totals) });
      cur = { events: [], steps: 0, metrics: totals };
      const v = queue.shift();
      if (v === undefined) {
        done();
        return new Promise<never>(() => {});
      }
      return { type: 'threshold', payload: { value: v, segmentIndex: data.thresholds.indexOf(v), threshold: String(v) } };
    },
    pollInput() {
      return null;
    },
  };
  void mapFilterReduceAlgorithm(ctx as never);
  await finished;
  cancelled = true;
  return rounds;
}

const pay = (e: FacetRuntimeEvent): Record<string, unknown> => e.payload as Record<string, unknown>;

describe('map-filter-reduce', () => {
  it('사다리 = segments, 첫 문턱 = 기본 구간, 데이터 크기', () => {
    const controls = (mapFilterReduceFacet.blocks.controls as { controls: { widget: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.thresholds);
    expect(knob?.segments?.find((s) => s.default)?.value).toBe(data.threshold);
    expect(data.marks).toHaveLength(6);
    expect(data.thresholds[data.thresholds.length - 1]).toBe(8);
    // IR 의 reduceSum 은 0 에서 시작한다
    expect(data.start).toBe(0);
  });

  it('문턱마다 algorithm = 사양 표 = IR', async () => {
    for (const th of data.thresholds) {
      const [round] = await drive([], th);
      const row = TABLE[th]!;
      const ev = round!.events.filter((e) => e.type !== 'phase');
      const kept = ev.filter((e) => e.type === 'filter-keep').map((e) => pay(e).x);
      const dropped = ev.filter((e) => e.type === 'filter-drop').map((e) => pay(e).x);
      const squares = ev.filter((e) => e.type === 'map-step').map((e) => pay(e).y);
      const answer = ev.find((e) => e.type === 'answer');
      expect(kept, `t=${th} kept`).toEqual(row.kept);
      expect(dropped, `t=${th} dropped`).toEqual(row.dropped);
      expect(squares, `t=${th} squares`).toEqual(row.squares);
      expect(pay(answer!).sum, `t=${th} sum`).toBe(row.sum);
      expect(round!.steps, `t=${th} 걸음`).toBe(row.steps);
      expect(round!.steps).toBe(8 + 2 * row.kept.length);
      // 누적은 앞에서부터
      const folds = ev.filter((e) => e.type === 'fold-step').map((e) => pay(e).next);
      expect(folds[folds.length - 1] ?? 0).toBe(row.sum);

      const keptBuf = new Array<number>(data.marks.length).fill(0);
      const sqBuf = new Array<number>(data.marks.length).fill(0);
      const r = runIR(mapFilterReduceImperativeIR, 'pipeline', [[...data.marks], keptBuf, sqBuf, th]);
      expect(r, `IR t=${th}`).toBe(row.sum);
      expect(keptBuf.slice(0, row.kept.length)).toEqual(row.kept);
      expect(sqBuf.slice(0, row.kept.length)).toEqual(row.squares);
    }
  });

  it('앞 문턱(한 칸 아래)에선 남았다가 이번에 떨어진 것 = 사양 표 마지막 열', async () => {
    const ladder = data.thresholds;
    for (let i = 1; i < ladder.length; i++) {
      const rounds = await drive([ladder[i]!], ladder[i - 1]);
      const lost = rounds[1]!.events.filter((e) => e.type === 'filter-drop' && pay(e).lost === true).map((e) => pay(e).x);
      expect(lost, `${ladder[i - 1]} → ${ladder[i]}`).toEqual(TABLE[ladder[i]!]!.lost);
    }
    // 내리면 되살아난다 — 8 → 4 에서 6 · 8 · 5
    const back = await drive([4], 8);
    expect(back[1]!.events.filter((e) => e.type === 'filter-keep' && pay(e).revived === true).map((e) => pay(e).x)).toEqual([6, 8, 5]);
  });

  it('회차별 계기 — 4 → 8 → 4', async () => {
    const rounds = await drive([8, 4]);
    const want = [
      [4, 4, 206],
      [1, 1, 81],
      [4, 4, 206],
    ];
    expect(rounds).toHaveLength(3);
    rounds.forEach((r, i) => {
      expect([r.metrics.get('filter-kept'), r.metrics.get('map-out'), r.metrics.get('reduce-result')], `판 ${i + 1}`).toEqual(want[i]);
    });
  });

  it('사다리 밖 문턱은 던진다', async () => {
    const ctx = {
      data: structuredClone(data),
      cancelled: false,
      metric() {},
      async emit() {},
      async sleep() {
        return true;
      },
      async waitForInput() {
        return { type: 'threshold', payload: { value: 5 } };
      },
      pollInput() {
        return null;
      },
    };
    await expect(mapFilterReduceAlgorithm(ctx as never)).rejects.toThrow(/사다리/);
  });

  it('무대 — mountView 로 붙이고 한 판을 부른다', () => {
    const container = document.createElement('div');
    const inst = mountView(mapFilterReduceStageView, container, { config: {}, initialData: mapFilterReduceFacet.initialData }) as unknown as MapFilterReduceStage;
    inst.startRound({ marks: data.marks, threshold: 6, start: 0, maxResult: 216, caption: 'Threshold: 6', dur: 0 });
    inst.filterDrop({ index: 0, dropSlot: 0, lost: true, caption: '6 > 6: false', tag: 'passed last time', dur: 0 });
    inst.filterDrop({ index: 1, dropSlot: 1, lost: false, caption: '3 > 6: false', tag: '', dur: 0 });
    inst.filterKeep({ index: 2, slot: 0, revived: false, caption: '8 > 6: true', tag: '', dur: 0 });
    inst.mapStep({ index: 2, slot: 0, y: 64, caption: '8 → 64', dur: 0 });
    inst.foldStep({ index: 2, slot: 0, y: 64, next: 64, caption: '0 + 64 = 64', dur: 0 });
    inst.answer({ sum: 64, caption: 'Result: 64', dur: 0 });
    const text = container.textContent ?? '';
    expect(text).toContain('let kept = filter(marks,');
    expect(text).toContain('x => x > 6');
    expect(text).toContain('Result: 64');
    inst.reset();
    inst.destroy();

    const bare = mountView(mapFilterReduceStageView, document.createElement('div'), { config: {} });
    bare.destroy();
  });
});

// @vitest-environment happy-dom
/**
 * mdp 고유의 주장 — 사양 표 대조 · IR ↔ algorithm 전 조합 · 회차별 계기 · 사다리 · 무대 문안.
 * 표의 수는 사양(sim.py)에서 옮긴 대조값이다 — initialData 가 아니라 여기에만 둔다.
 */
import { describe, expect, it } from 'vitest';
import type { Value } from '@ffacet/ir-interpreter';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import {
  followPolicy,
  mdpAlgorithm,
  mdpFacet,
  mdpImperativeIR,
  mdpProjector,
  mdpStageView,
  planMdp,
  readMdpData,
  resetValues,
  sweep,
  type MdpData,
} from '../src/index.js';

const data = readMdpData(mdpFacet.initialData);
const fx = (x: number, d = 2): string => x.toFixed(d);

type Row = { gamma: number; slip: number; v: string; arrows: string; lastTurn: number; metrics: [number, number, number] };
const TABLE: Row[] = [
  { gamma: 0.6, slip: 0, v: '3.00', arrows: '↓', lastTurn: 4, metrics: [12, 0, 1] },
  { gamma: 0.6, slip: 0.1, v: '2.62', arrows: '↓', lastTurn: 4, metrics: [12, 0, 1] },
  { gamma: 0.6, slip: 0.2, v: '2.14', arrows: '↓', lastTurn: 4, metrics: [12, 0, 1] },
  { gamma: 0.8, slip: 0, v: '5.12', arrows: '→→→→', lastTurn: 5, metrics: [12, 0, 4] },
  { gamma: 0.8, slip: 0.1, v: '2.88', arrows: '↓', lastTurn: 6, metrics: [12, 0, 1] },
  { gamma: 0.8, slip: 0.2, v: '2.54', arrows: '↓', lastTurn: 12, metrics: [12, 1, 1] },
  { gamma: 0.96, slip: 0, v: '8.85', arrows: '→→→→', lastTurn: 5, metrics: [12, 0, 4] },
  { gamma: 0.96, slip: 0.1, v: '7.34', arrows: '↑→→→→↓', lastTurn: 8, metrics: [12, 0, 6] },
  { gamma: 0.96, slip: 0.2, v: '5.05', arrows: '↑→→→→↓', lastTurn: 11, metrics: [12, 0, 6] },
];
const END_KIND: Record<string, number> = { '↓': 1, '→→→→': 2, '↑→→→→↓': 2 };

describe('mdp — 사양 표 대조', () => {
  it.each(TABLE)('γ $gamma · p $slip', (row) => {
    const run = planMdp(data, row.gamma, row.slip);
    expect(run.frames).toHaveLength(12);
    const last = run.frames[11]!;
    expect(fx(last.startValue)).toBe(row.v);
    expect(run.arrows).toBe(row.arrows);
    expect(run.endKind).toBe(END_KIND[row.arrows]);
    const turnedAt = run.frames.filter((f) => f.turned.length > 0).map((f) => f.sweep);
    expect(Math.max(...turnedAt)).toBe(row.lastTurn);
    expect([last.sweep, last.turned.length, run.moves]).toEqual(row.metrics);
    expect(run.frames.map((f) => f.nonZero)).toEqual([4, 8, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  });

  it('기본값 γ 0.96 · p 0.1 의 바퀴 차례', () => {
    const run = planMdp(data, 0.96, 0.1);
    expect(run.frames.map((f) => fx(f.startValue))).toEqual(
      ['2.40', '2.63', '2.73', '2.89', '2.92', '4.09', '5.16', '6.04', '6.61', '6.98', '7.20', '7.34'],
    );
    expect(run.frames.map((f) => f.turned.length)).toEqual([6, 4, 3, 1, 4, 1, 0, 1, 0, 0, 0, 0]);
    expect(run.frames.map((f) => fx(f.change, 3))).toEqual(
      ['8.000', '6.816', '5.655', '3.217', '1.913', '1.295', '1.074', '0.875', '0.568', '0.375', '0.220', '0.135'],
    );
    // 출발 칸 화살표: 바퀴 1..5 ↓ · 6..7 → · 8 부터 ↑
    expect(run.frames.map((f) => f.policy[data.start])).toEqual([2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0]);
    // 바퀴 12 의 칸 값 (사양 ②)
    expect(run.frames[11]!.values.map((x) => fx(x))).toEqual([
      '7.76', '8.27', '8.78', '9.31', '9.84',
      '7.34', '7.82', '8.34', '8.94', '0.00',
      '0.00', '0.00', '0.00', '0.00', '7.74',
    ]);
  });

  it('동률 — 바퀴 1..2 의 먼 칸은 네 q 가 모두 같아 화살표가 없다', () => {
    const run = planMdp(data, 0.96, 0.1);
    expect(run.frames[0]!.policy.slice(0, 4)).toEqual([-1, -1, -1, -1]);
    expect(run.frames[1]!.policy.slice(1, 3)).toEqual([-1, -1]);
    expect(run.frames[2]!.policy.every((a, i) => data.cells[i] !== 0 || a >= 0)).toBe(true);
  });
});

function irAgreesOnGrid(d: MdpData): void {
  for (const gamma of d.gammaLadder) {
    for (const slip of d.slipLadder) {
      const n = d.rows * d.cols;
      const algV = new Array<number>(n).fill(0);
      const algOut = new Array<number>(n).fill(0);
      const algP = new Array<number>(n).fill(-1);
      const irV: Value[] = new Array<number>(n).fill(1);
      runIR(mdpImperativeIR, 'resetValues', [irV]);
      resetValues(algV);
      expect(irV).toEqual(algV);
      const irOut: Value[] = new Array<number>(n).fill(0);
      const irP: Value[] = new Array<number>(n).fill(-1);
      for (let k = 1; k <= d.sweeps; k++) {
        const a = sweep(d.cells, d.rewards, algV, algOut, algP, d.rows, d.cols, gamma, slip);
        const b = runIR(mdpImperativeIR, 'sweep', [d.cells, d.rewards, irV, irOut, irP, d.rows, d.cols, gamma, slip]);
        expect(b).toBe(a);
        expect(irV).toEqual(algV);
        expect(irP).toEqual(algP);
      }
      const algPath = new Array<number>(d.pathLimit + 1).fill(-1);
      const irPath: Value[] = new Array<number>(d.pathLimit + 1).fill(-1);
      const m1 = followPolicy(algP, d.cells, d.start, d.rows, d.cols, d.pathLimit, algPath);
      const m2 = runIR(mdpImperativeIR, 'followPolicy', [irP, d.cells, d.start, d.rows, d.cols, d.pathLimit, irPath]);
      expect(m2).toBe(m1);
      expect(irPath).toEqual(algPath);
      expect(m1).toBeGreaterThan(0);
    }
  }
}

describe('mdp — IR ↔ algorithm', () => {
  it('사다리 · 매개변수 길이', () => {
    const controls = (mdpFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const g = controls.find((x) => x.name === 'gamma')!;
    const s = controls.find((x) => x.name === 'slip')!;
    expect(g.segments!.map((x) => x.value)).toEqual(data.gammaLadder);
    expect(s.segments!.map((x) => x.value)).toEqual(data.slipLadder);
    expect(g.segments!.find((x) => x.default)!.value).toBe(data.gamma);
    expect(s.segments!.find((x) => x.default)!.value).toBe(data.slip);
    expect(data.cells).toHaveLength(15);
    expect(data.gammaLadder.at(-1)).toBe(0.96);
    expect(data.slipLadder.at(-1)).toBe(0.2);
  });

  it('아홉 조합 × 바퀴 1..12 에서 values · policy · 반환 · 길이 같다', () => {
    irAgreesOnGrid(data);
  });

  it('행 차례를 뒤집은 격자에서도 같다', () => {
    const flipped: number[] = [];
    for (let r = data.rows - 1; r >= 0; r--) flipped.push(...data.cells.slice(r * data.cols, (r + 1) * data.cols));
    const sr = Math.floor(data.start / data.cols);
    const start = (data.rows - 1 - sr) * data.cols + (data.start % data.cols);
    irAgreesOnGrid({ ...data, cells: flipped, start });
  });
});

type Input = { type: string; payload?: unknown };

/** 가짜 reactive ctx — sleep 은 곧장 참, 입력은 목록에서, 다 쓰면 취소 */
async function drive(inputs: Input[], onEvent?: (e: FacetRuntimeEvent) => void) {
  const metrics = new Map<string, number>();
  const snapshots: Record<string, number>[] = [];
  const events: FacetRuntimeEvent[] = [];
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: structuredClone(mdpFacet.initialData),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      onEvent?.(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      snapshots.push(Object.fromEntries(metrics));
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<MdpData>;
  await mdpAlgorithm(ctx);
  return { snapshots, events };
}

describe('mdp — 회차별 계기', () => {
  it('γ 0.96 → 0.8 → 0.96, 미끄러짐 0 → 0.1 에서 판마다 표와 같다', async () => {
    const { snapshots } = await drive([
      { type: 'gamma', payload: { value: 0.8 } },
      { type: 'gamma', payload: { value: 0.96 } },
      { type: 'slip', payload: { value: 0 } },
      { type: 'nothing', payload: { value: 1 } },
      { type: 'slip', payload: { value: 0.1 } },
    ]);
    const pick = (g: number, p: number) => TABLE.find((r) => r.gamma === g && r.slip === p)!.metrics;
    const as3 = (s: Record<string, number>) => [s['sweeps'], s['arrows-turned'], s['path-moves']];
    // 입력을 기다릴 때마다 찍는다 — 모르는 입력은 판을 다시 돌리지 않으니 같은 값이 한 번 더 찍힌다
    expect(snapshots.map(as3)).toEqual([
      pick(0.96, 0.1), pick(0.8, 0.1), pick(0.96, 0.1), pick(0.96, 0), pick(0.96, 0), pick(0.96, 0.1),
    ]);
  });

  it('손잡이 입력의 모양이 어긋나면 던진다', async () => {
    await expect(drive([{ type: 'slip', payload: { value: 0.15 } }])).rejects.toThrow('사다리에 없다');
    await expect(drive([{ type: 'gamma', payload: { value: '0.8' } }])).rejects.toThrow('수가 아니다');
    await expect(drive([{ type: 'gamma' }])).rejects.toThrow('객체가 아니다');
  });

  it('걸음 차례 — phase 는 init · backup × 12 · path', async () => {
    const { events } = await drive([]);
    const phases = events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase);
    expect(phases).toEqual(['init', ...new Array(12).fill('backup'), 'path']);
  });
});

describe('mdp — 무대 문안', () => {
  it('끝 걸음의 캡션이 셈한 길과 V(S) 를 말하고, 새 판 걸음 0 에서 결론을 걷는다', async () => {
    const container = document.createElement('div');
    const stage = mountView(mdpStageView, container, {
      config: {}, locale: 'ko', t: makeTranslator('ko', mdpFacet.messages),
    });
    const projector = mdpProjector({ stage }, { getSpeed: () => 1, t: makeTranslator('ko', mdpFacet.messages) });
    const captions: string[] = [];
    await drive([{ type: 'gamma', payload: { value: 0.8 } }], (e) => {
      void projector.onEvent(e);
      if (e.type === 'path' || e.type === 'run-start') captions.push(container.textContent ?? '');
    });
    expect(captions[1]).toContain('↑→→→→↓');
    expect(captions[1]).toContain('큰 목표 · 이동 6');
    expect(captions[1]).toContain('바퀴 12 뒤 V(S): 7.34');
    expect(captions[2]).not.toContain('↑→→→→↓');
    expect(captions[2]).not.toContain('7.34');
    expect(captions[2]).toContain('γ 0.8 · 미끄러짐 0.1');
    expect(captions[3]).toContain('작은 목표 · 이동 1');
    expect(captions[3]).toContain('V(S): 2.88');
    stage.destroy();
  });
});

// @vitest-environment happy-dom
/**
 * 변환의 합성 — facet 고유의 주장.
 *   1. IR ↔ algorithm 이 열두 조합 모두에서 같은 합성 행렬 · 도착을 낸다 (인수 k 개만 넘겨도)
 *   2. 사양 실측표 (합성 행렬 · 이동 열 · 도착) 와 셈이 같다
 *   3. 걸음 차례 — init → sleep → 첫 phase, 걸음 이벤트마다 바로 앞이 그 걸음의 phase
 *   4. 계기 — 손잡이 0 → 3 → 0 회차마다 끝 값, 회차별 걸음 값
 *   5. 사다리 = segments, 무대 첫 그림이 멱등
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  composeUpTo,
  factorsFor,
  readScaleRotateTranslateData,
  scaleRotateTranslateAlgorithm,
  scaleRotateTranslateFacet,
  scaleRotateTranslateImperativeIR,
  scaleRotateTranslateStageView,
  transformShape,
  type Mat3,
  type ScaleRotateTranslateData,
  type ScaleRotateTranslateStage,
} from '../src/index.js';

const data = readScaleRotateTranslateData(scaleRotateTranslateFacet.initialData);

type Row = { m: Mat3; arrive: [number, number][] };
/** 사양 실측표 — [중심][순서] */
const TABLE: Row[][] = [
  [
    { m: [0, -1, 3, 2, 0, 1, 0, 0, 1], arrive: [[3, 1], [3, 5], [2, 5], [2, 3], [1, 3], [1, 1]] },
    { m: [0, -1, -1, 2, 0, 3, 0, 0, 1], arrive: [[-1, 3], [-1, 7], [-2, 7], [-2, 5], [-3, 5], [-3, 3]] },
    { m: [0, -2, 3, 1, 0, 1, 0, 0, 1], arrive: [[3, 1], [3, 3], [1, 3], [1, 2], [-1, 2], [-1, 1]] },
    { m: [0, -2, 6, 1, 0, 1, 0, 0, 1], arrive: [[6, 1], [6, 3], [4, 3], [4, 2], [2, 2], [2, 1]] },
    { m: [0, -1, -1, 2, 0, 6, 0, 0, 1], arrive: [[-1, 6], [-1, 10], [-2, 10], [-2, 8], [-3, 8], [-3, 6]] },
    { m: [0, -2, -2, 1, 0, 3, 0, 0, 1], arrive: [[-2, 3], [-2, 5], [-4, 5], [-4, 4], [-6, 4], [-6, 3]] },
  ],
  [
    { m: [0, -1, 5, 2, 0, 1, 0, 0, 1], arrive: [[5, 1], [5, 5], [4, 5], [4, 3], [3, 3], [3, 1]] },
    { m: [0, -1, 1, 2, 0, 3, 0, 0, 1], arrive: [[1, 3], [1, 7], [0, 7], [0, 5], [-1, 5], [-1, 3]] },
    { m: [0, -2, 7, 1, 0, 1, 0, 0, 1], arrive: [[7, 1], [7, 3], [5, 3], [5, 2], [3, 2], [3, 1]] },
    { m: [0, -2, 10, 1, 0, 1, 0, 0, 1], arrive: [[10, 1], [10, 3], [8, 3], [8, 2], [6, 2], [6, 1]] },
    { m: [0, -1, 1, 2, 0, 6, 0, 0, 1], arrive: [[1, 6], [1, 10], [0, 10], [0, 8], [-1, 8], [-1, 6]] },
    { m: [0, -2, 2, 1, 0, 3, 0, 0, 1], arrive: [[2, 3], [2, 5], [0, 5], [0, 4], [-2, 4], [-2, 3]] },
  ],
];

/** 계기 표 — [중심][순서] 걸음 1·2·3 의 (x, y) */
const METER: [number, number][][][] = [
  [
    [[0, 0], [0, 0], [3, 1]],
    [[0, 0], [3, 1], [-1, 3]],
    [[0, 0], [0, 0], [3, 1]],
    [[0, 0], [3, 1], [6, 1]],
    [[3, 1], [6, 1], [-1, 6]],
    [[3, 1], [-1, 3], [-2, 3]],
  ],
  [
    [[0, 0], [2, 0], [5, 1]],
    [[0, 0], [3, 1], [1, 3]],
    [[2, 0], [4, 0], [7, 1]],
    [[2, 0], [5, 1], [10, 1]],
    [[3, 1], [6, 1], [1, 6]],
    [[3, 1], [1, 3], [2, 3]],
  ],
];

function runArrive(factors: number[], shape: { x: number; y: number }[]) {
  const m = new Array<number>(9).fill(0);
  const tmp = new Array<number>(9).fill(0);
  const res = new Array<number>(3).fill(0);
  const arrX = new Array<number>(shape.length).fill(0);
  const arrY = new Array<number>(shape.length).fill(0);
  const ret = runIR(scaleRotateTranslateImperativeIR, 'arrive', [
    factors,
    shape.map((p) => p.x),
    shape.map((p) => p.y),
    m,
    tmp,
    res,
    arrX,
    arrY,
  ]);
  return { ret, m, arrX, arrY };
}

const combos: [number, number][] = [];
for (let pivot = 0; pivot < 2; pivot++) for (let order = 0; order < 6; order++) combos.push([order, pivot]);

describe('자료 · 사다리', () => {
  it('사다리 크기와 segments 값이 같다', () => {
    expect(data.orders).toHaveLength(6);
    expect(data.pivots).toHaveLength(2);
    expect(data.shape).toHaveLength(6);
    const controls = (scaleRotateTranslateFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] })
      .controls;
    const seg = (name: string) => controls.find((c) => c.name === name)?.segments?.map((s) => s.value);
    expect(seg('order')).toEqual([0, 1, 2, 3, 4, 5]);
    expect(seg('pivot')).toEqual([0, 1]);
  });
});

describe('셈 = 사양 실측표', () => {
  it.each(combos)('순서 %i · 중심 %i', (order, pivot) => {
    const row = TABLE[pivot]![order]!;
    const factors = factorsFor(data, order, pivot);
    const m = composeUpTo(factors, 3);
    expect(m).toEqual(row.m);
    expect(transformShape(m, data.shape).map((p) => [p.x, p.y])).toEqual(row.arrive);
    for (let k = 1; k <= 3; k++) {
      const mk = composeUpTo(factors, k);
      expect([mk[2], mk[5]]).toEqual(METER[pivot]![order]![k - 1]);
    }
  });

  it('열두 조합의 도착이 모두 다르고, 중심만 바꾸면 (2, 0) 또는 (4, 0) 만큼 미끄러진다', () => {
    const keys = new Set(combos.map(([o, p]) => JSON.stringify(transformShape(composeUpTo(factorsFor(data, o, p), 3), data.shape))));
    expect(keys.size).toBe(12);
    const slide = [2, 2, 4, 4, 2, 4];
    for (let o = 0; o < 6; o++) {
      const a = transformShape(composeUpTo(factorsFor(data, o, 0), 3), data.shape);
      const b = transformShape(composeUpTo(factorsFor(data, o, 1), 3), data.shape);
      a.forEach((p, i) => expect([b[i]!.x - p.x, b[i]!.y - p.y]).toEqual([slide[o], 0]));
    }
  });
});

describe('IR ↔ algorithm', () => {
  it.each(combos)('순서 %i · 중심 %i — 합성 행렬 · 도착 · 인수 k 개', (order, pivot) => {
    const factors = factorsFor(data, order, pivot);
    const flat = factors.flatMap((f) => f.matrix);
    const { ret, m, arrX, arrY } = runArrive(flat, data.shape);
    expect(ret).toBe(6);
    expect(m).toEqual(composeUpTo(factors, 3));
    const arrived = transformShape(composeUpTo(factors, 3), data.shape);
    expect(arrX).toEqual(arrived.map((p) => p.x));
    expect(arrY).toEqual(arrived.map((p) => p.y));
    for (let k = 1; k <= 2; k++) {
      const part = runArrive(flat.slice(0, k * 9), data.shape);
      expect(part.m).toEqual(composeUpTo(factors, k));
    }
    // 꼭짓점 차례를 뒤집어도 같은 꼭짓점끼리 같다
    const rev = [...data.shape].reverse();
    const r = runArrive(flat, rev);
    rev.forEach((p, i) => {
      const q = arrived.find((a) => a.id === p.id)!;
      expect([r.arrX[i], r.arrY[i]]).toEqual([q.x, q.y]);
    });
  });

  it('셋째 줄이 0 0 1 이 아닌 가짜 인수 — TS 는 던지고 IR 은 −1', () => {
    const fake: Mat3 = [1, 0, 0, 0, 1, 0, 0, 1, 1];
    expect(() => transformShape(fake, data.shape)).toThrow(/셋째 칸/);
    expect(runArrive(fake, data.shape).ret).toBe(-1);
  });
});

// ── 알고리즘을 가짜 ctx 로 돌린다 ─────────────────────────────────────────────

type Log =
  | { kind: 'event'; e: FacetRuntimeEvent }
  | { kind: 'sleep'; ms: number }
  | { kind: 'metric'; name: string; delta: number };

async function play(inputs: { type: string; payload: unknown }[]) {
  const log: Log[] = [];
  const queue = [...inputs];
  const meter = new Map<string, number>();
  const ctx = {
    data: data as ScaleRotateTranslateData,
    cancelled: false,
    async emit(e: FacetRuntimeEvent) {
      log.push({ kind: 'event', e });
    },
    metric(name: string, delta: number | 'inc') {
      const d = delta === 'inc' ? 1 : delta;
      meter.set(name, (meter.get(name) ?? 0) + d);
      log.push({ kind: 'metric', name, delta: d });
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return true;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next === undefined) {
        ctx.cancelled = true;
        throw new Error('끝');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await scaleRotateTranslateAlgorithm(ctx as unknown as FacetContext<ScaleRotateTranslateData>);
  return { log, meter };
}

describe('걸음 차례', () => {
  it('init → sleep(stepMs + motionMs) → 첫 phase, 걸음마다 바로 앞이 그 걸음의 phase', async () => {
    const { log } = await play([]);
    const seq = log.filter((l) => l.kind !== 'metric');
    const first = seq[0];
    expect(first?.kind === 'event' && first.e.type === 'round' && first.e.silent).toBe(true);
    expect(seq[1]).toEqual({ kind: 'sleep', ms: data.stepMs + data.motionMs });
    const events = seq.flatMap((l) => (l.kind === 'event' ? [l.e] : []));
    const steps = events.filter((e) => !e.silent);
    expect(steps.map((e) => e.type)).toEqual(['compose', 'compose', 'compose', 'apply']);
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      if (e.silent) continue;
      const prev = events[i - 1]!;
      expect(prev.type).toBe('phase');
      expect((prev.payload as { phase: string }).phase).toBe(e.type);
    }
    // 걸음 1..3 뒤에 sleep, 마지막 걸음 뒤는 없다 → 재생 4 × 2300
    const sleeps = seq.filter((l) => l.kind === 'sleep');
    expect(sleeps.reduce((s, l) => s + (l.kind === 'sleep' ? l.ms : 0), 0)).toBe(9200);
    const apply = steps[3]!.payload as { same: number; unitW: number; total: number; step: number };
    expect(apply).toMatchObject({ same: 6, unitW: 6, total: 6, step: 4 });
  });

  it('계기 — 손잡이 0 → 3 → 0 회차마다 끝 값 (3, 1) → (6, 1) → (3, 1), 회차별 걸음 값', async () => {
    const { log } = await play([
      { type: 'order', payload: { value: 3 } },
      { type: 'order', payload: { value: 0 } },
      { type: 'pivot', payload: { value: 1 } },
      { type: 'order', payload: { value: 3 } },
    ]);
    // 회차마다 걸음 1·2·3 뒤 계기 값을 다시 쌓아 본다
    const rounds: [number, number][][] = [];
    let x = 0;
    let y = 0;
    let pendingX = false;
    for (const l of log) {
      if (l.kind === 'event' && l.e.type === 'round') rounds.push([]);
      if (l.kind !== 'metric') continue;
      if (l.name === 'shift-x') {
        x += l.delta;
        pendingX = true;
      } else if (l.name === 'shift-y') {
        y += l.delta;
        if (!pendingX) throw new Error('shift-y 가 shift-x 없이 왔다');
        pendingX = false;
        rounds[rounds.length - 1]!.push([x, y]);
      }
    }
    // 판 머리 (0, 0) + 걸음 셋
    expect(rounds).toEqual([
      [[0, 0], ...METER[0]![0]!],
      [[0, 0], ...METER[0]![3]!],
      [[0, 0], ...METER[0]![0]!],
      [[0, 0], ...METER[1]![0]!],
      [[0, 0], ...METER[1]![3]!],
    ]);
    expect(rounds.map((r) => r[3])).toEqual([[3, 1], [6, 1], [3, 1], [5, 1], [10, 1]]);
  });

  it('제 손잡이의 사다리 밖 값은 던지고, 남의 입력은 흘린다', async () => {
    await expect(play([{ type: 'speed', payload: { value: 99 } }])).resolves.toBeDefined();
    await expect(play([{ type: 'order', payload: { value: 6 } }])).rejects.toThrow(/사다리/);
  });
});

describe('무대', () => {
  it('첫 그림이 멱등 — 같은 init 을 두 번 먹여도 요소 수가 같다, reset 뒤 걸린다', async () => {
    const container = document.createElement('div');
    const stage = mountView(scaleRotateTranslateStageView, container, { config: {} }) as unknown as ScaleRotateTranslateStage;
    const { log } = await play([]);
    const round = log.find((l) => l.kind === 'event' && l.e.type === 'round');
    if (round?.kind !== 'event') throw new Error('round 없음');
    const p = round.e.payload as Parameters<ScaleRotateTranslateStage['begin']>[0];
    stage.begin({ ...p, durationMs: 0 });
    const n1 = container.querySelectorAll('*').length;
    stage.begin({ ...p, durationMs: 0 });
    expect(container.querySelectorAll('*').length).toBe(n1);
    stage.reset();
    stage.begin({ ...p, durationMs: 0 });
    expect(container.querySelectorAll('*').length).toBe(n1);
    stage.destroy();
  });
});

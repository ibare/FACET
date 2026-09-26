// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  boundarySegment,
  perceptronAlgorithm,
  perceptronFacet,
  perceptronImperativeIR,
  perceptronProjector,
  perceptronStageView,
  perceptronTrain,
  placePoints,
  readPerceptronData,
  runPerceptron,
  type PerceptronData,
} from '../src/index.js';

const data: PerceptronData = readPerceptronData(perceptronFacet.initialData);

/** 사양의 실측표 (sim `perceptron`) */
const TABLE = [
  { value: 0, spot: [6, 6], separable: true, kind: 'stop', end: 4, pair: -1, updates: 11, errs: [5, 5, 1, 0], w: [-5, 1, 0], ties: 1, steps: 6 },
  { value: 1, spot: [5, 5], separable: true, kind: 'stop', end: 8, pair: -1, updates: 31, errs: [5, 5, 5, 3, 5, 5, 3, 0], w: [-13, 3, 0], ties: 4, steps: 10 },
  { value: 2, spot: [4, 4], separable: true, kind: 'stop', end: 5, pair: -1, updates: 17, errs: [5, 5, 6, 1, 0], w: [-7, 1, 1], ties: 3, steps: 7 },
  { value: 3, spot: [3, 3], separable: false, kind: 'repeat', end: 10, pair: 7, updates: 38, errs: [5, 5, 6, 3, 4, 6, 3, 2, 2, 2], w: [-10, 2, 1], ties: 3, steps: 12 },
  { value: 4, spot: [2, 2], separable: false, kind: 'repeat', end: 8, pair: 6, updates: 31, errs: [5, 5, 5, 6, 3, 3, 2, 2], w: [-9, 3, -1], ties: 5, steps: 10 },
] as const;

type Knob = { action: string; segments: { value: number; default?: boolean }[] };
function knob(): Knob {
  const controls = (perceptronFacet.blocks.controls as { controls: unknown[] }).controls;
  const k = controls.find((c) => (c as { widget?: string }).widget === 'segmented-slider');
  if (!k) throw new Error('손잡이가 없다');
  return k as Knob;
}

/** IR 로 한 판을 돈다 — 버퍼는 부르는 쪽이 만든다. */
function irRun(xs1: number[], xs2: number[], ys: number[], maxEpochs: number) {
  const w = [9, 9, 9];
  const seen0 = new Array<number>(maxEpochs + 1).fill(0);
  const seen1 = new Array<number>(maxEpochs + 1).fill(0);
  const seen2 = new Array<number>(maxEpochs + 1).fill(0);
  const errs = new Array<number>(maxEpochs).fill(0);
  const hit = [0];
  const result = runIR(perceptronImperativeIR, 'perceptronTrain', [xs1, xs2, ys, w, seen0, seen1, seen2, errs, hit, maxEpochs]);
  return { result, w, errs, hit: hit[0] };
}
function tsRun(xs1: number[], xs2: number[], ys: number[], maxEpochs: number) {
  const w = [9, 9, 9];
  const seen0 = new Array<number>(maxEpochs + 1).fill(0);
  const seen1 = new Array<number>(maxEpochs + 1).fill(0);
  const seen2 = new Array<number>(maxEpochs + 1).fill(0);
  const errs = new Array<number>(maxEpochs).fill(0);
  const hit = [0];
  const result = perceptronTrain(xs1, xs2, ys, w, seen0, seen1, seen2, errs, hit, maxEpochs);
  return { result, w, errs, hit: hit[0] };
}

/** 식이 적힌 결정론적 뒤섞기 (선형 합동) — 난수 대신 */
function shuffled(n: number, seed: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('perceptron — 사양 대조', () => {
  it('사다리가 손잡이 segments 와 같고 기본값이 같다', () => {
    const k = knob();
    expect(k.action).toBe('movedPoint');
    expect(k.segments.map((s) => s.value)).toEqual(data.ladder.map((_, i) => i));
    expect(k.segments.find((s) => s.default)?.value).toBe(data.movedPoint);
    expect(data.ladder.map((s) => [s.x1, s.x2])).toEqual(TABLE.map((r) => [...r.spot]));
    expect(data.points).toHaveLength(10);
    expect(data.maxEpochs).toBe(20);
  });

  for (const row of TABLE) {
    it(`값 ${row.value} (${row.spot.join(', ')}) — 판정 · 에폭 · 갱신 · 틀린 수 · 끝 무게 · 동률`, () => {
      const run = runPerceptron(data, row.value);
      expect(run.kind).toBe(row.kind);
      expect(run.endEpoch).toBe(row.end);
      expect(run.pair).toBe(row.pair);
      expect(run.updates).toBe(row.updates);
      expect(run.epochs.map((e) => e.errors)).toEqual([...row.errs]);
      expect(run.epochs[run.epochs.length - 1]!.w).toEqual([...row.w]);
      expect(run.ties).toBe(row.ties);
      // 되풀이면 끝 무게 = 짝 에폭 끝 무게
      if (row.kind === 'repeat') expect(run.seen[row.pair]).toEqual([...row.w]);
      // 멈춤 칸은 마지막 에폭만 0, 되풀이 칸은 모두 1 이상
      const zeros = run.epochs.filter((e) => e.errors === 0).length;
      expect(zeros).toBe(row.separable ? 1 : 0);
    });
  }

  it('기본 판의 갱신 차례가 사양 걸음과 같다', () => {
    const run = runPerceptron(data, 0);
    const ids = data.points.map((p) => p.id);
    const updates = run.epochs.map((e) => e.visits.filter((v) => v.wrong).map((v) => `${ids[v.index]} (${v.w.join(', ')})`));
    expect(updates).toEqual([
      ['p1 (1, 8, 8)', 'p2 (0, 4, 5)', 'p4 (-1, 3, 2)', 'p5 (-2, 0, 1)', 'p10 (-3, -2, -3)'],
      ['p1 (-2, 6, 5)', 'p2 (-3, 2, 2)', 'p4 (-4, 1, -1)', 'p7 (-3, 7, 7)', 'p10 (-4, 5, 3)'],
      ['p2 (-5, 1, 0)'],
      [],
    ]);
  });

  it('끝 경계선 — 사양의 끝 경계 식과 같은 직선', () => {
    // −5 + x1 = 0 → x1 = 5 · −13 + 3·x1 = 0 → x1 = 13/3
    expect(boundarySegment([-5, 1, 0], 0, 9)).toEqual([5, 0, 5, 9]);
    const s1 = boundarySegment([-13, 3, 0], 0, 9)!;
    expect(s1[0]).toBeCloseTo(13 / 3);
    // −7 + x1 + x2 = 0 의 두 끝점은 (0, 7) 과 (7, 0)
    const s2 = boundarySegment([-7, 1, 1], 0, 9)!;
    for (const [a, b] of [[s2[0]!, s2[1]!], [s2[2]!, s2[3]!]]) expect(-7 + a + b).toBeCloseTo(0);
    expect(boundarySegment([0, 0, 0], 0, 9)).toBeNull();
    expect(boundarySegment([-7, 0, 0], 0, 9)).toBeNull();
  });
});

describe('perceptron — IR 과 algorithm 이 같은 답', () => {
  for (const row of TABLE) {
    it(`값 ${row.value} — 돌려줌 · 무게 · 틀린 수 · 짝`, () => {
      const { xs1, xs2, ys } = placePoints(data, row.value);
      const ir = irRun(xs1, xs2, ys, data.maxEpochs);
      const ts = tsRun(xs1, xs2, ys, data.maxEpochs);
      expect(ir).toEqual(ts);
      const run = runPerceptron(data, row.value);
      expect(ir.result).toBe(run.result);
      expect(ir.w).toEqual([...row.w]);
      expect(ir.errs.slice(0, row.end)).toEqual([...row.errs]);
      if (row.kind === 'repeat') expect(ir.hit).toBe(row.pair);
    });
  }

  it('점의 차례를 섞어도 IR 과 algorithm 이 같고, 판정은 자리마다 같다', () => {
    const cap = 800;
    for (const row of TABLE) {
      const placed = placePoints(data, row.value);
      for (const seed of [1, 7, 42, 2024]) {
        const order = shuffled(placed.ys.length, seed);
        const xs1 = order.map((i) => placed.xs1[i]!);
        const xs2 = order.map((i) => placed.xs2[i]!);
        const ys = order.map((i) => placed.ys[i]!);
        const ir = irRun(xs1, xs2, ys, cap);
        const ts = tsRun(xs1, xs2, ys, cap);
        expect(ir, `값 ${row.value} · seed ${seed}`).toEqual(ts);
        expect(Math.sign(ts.result as number), `값 ${row.value} · seed ${seed}`).toBe(row.kind === 'stop' ? 1 : -1);
        // 섞은 차례로 돌린 algorithm 의 한 판도 같은 답
        const run = runPerceptron({ ...data, maxEpochs: cap }, row.value, order);
        expect(run.result).toBe(ts.result);
      }
    }
  });
});

// ── 알고리즘을 돌려 판마다 모은다

type Round = { events: FacetRuntimeEvent[]; metrics: Map<string, number> };

async function drive(values: number[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let current: Round = { events: [], metrics: totals };
  const queue = [...values];
  let cancelled = false;
  let idle!: () => void;
  const done = new Promise<void>((r) => (idle = r));
  const ctx = {
    data: structuredClone(perceptronFacet.initialData),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent) {
      current.events.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ events: current.events, metrics: new Map(totals) });
      current = { events: [], metrics: totals };
      const v = queue.shift();
      if (v === undefined) {
        idle();
        return new Promise<never>(() => {});
      }
      return { type: 'movedPoint', payload: { value: v } };
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([perceptronAlgorithm(ctx as never), done]);
  cancelled = true;
  return rounds;
}

const phaseOf = (e: FacetRuntimeEvent | undefined): string | null =>
  e?.type === 'phase' ? String((e.payload as { phase: unknown }).phase) : null;

describe('perceptron — 판과 걸음', () => {
  it('회차별 계기 A → B → A (0 → 3 → 0 → 4 → 1 → 2)', async () => {
    const order = [0, 3, 0, 4, 1, 2];
    const rounds = await drive(order.slice(1));
    expect(rounds).toHaveLength(order.length);
    rounds.forEach((r, i) => {
      const row = TABLE[order[i]!]!;
      expect(r.metrics.get('epochs'), `판 ${i}`).toBe(row.end);
      expect(r.metrics.get('updates'), `판 ${i}`).toBe(row.updates);
      const steps = r.events.filter((e) => e.silent !== true);
      expect(steps).toHaveLength(row.steps);
      expect(steps[0]!.type).toBe('start');
      expect(steps[steps.length - 1]!.type).toBe('verdict');
      const v = steps[steps.length - 1]!.payload as { kind: string; epoch: number; pair: number };
      expect(v.kind).toBe(row.kind);
      expect(v.epoch).toBe(row.end);
      expect(v.pair).toBe(row.pair);
    });
  });

  it('걸음마다 바로 앞이 그 걸음의 phase 다 — 걸음 #0 에는 phase 가 없다', async () => {
    const rounds = await drive([3]);
    for (const r of rounds) {
      r.events.forEach((e, i) => {
        if (e.silent === true) return;
        const before = phaseOf(r.events[i - 1]);
        if (e.type === 'start') expect(before).toBeNull();
        else if (e.type === 'epoch') expect(before).toBe('sweep');
        else if (e.type === 'verdict') expect(before).toBe((e.payload as { kind: string }).kind);
        else throw new Error(`모르는 걸음 ${e.type}`);
      });
    }
    // init 은 첫 판 머리에 한 번, silent
    expect(rounds[0]!.events[0]!.type).toBe('init');
    expect(rounds[0]!.events[0]!.silent).toBe(true);
    expect(rounds[1]!.events.some((e) => e.type === 'init')).toBe(false);
  });

  it('사다리 밖 값은 던진다', async () => {
    const ctx = {
      data: structuredClone(perceptronFacet.initialData),
      cancelled: false,
      metric() {},
      async emit() {},
      async sleep() {
        return true;
      },
      async waitForInput() {
        return { type: 'movedPoint', payload: { value: 7 } };
      },
      pollInput() {
        return null;
      },
    };
    await expect(perceptronAlgorithm(ctx as never)).rejects.toThrow(/사다리 밖/);
  });
});

describe('perceptron — 무대', () => {
  async function mounted() {
    const rounds = await drive([3, 0]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(perceptronStageView, container, {
      config: { type: 'perceptron-stage' },
      initialData: perceptronFacet.initialData as Record<string, unknown>,
      locale: 'ko',
      t: (_k: string, en: string) => en,
      isInstant: () => true,
    });
    const projector = perceptronProjector({ stage }, { getSpeed: () => 1, t: (_k, en) => en });
    return { rounds, container, projector };
  }

  it('첫 그림을 두 번 먹여도 요소 수가 같다', async () => {
    const { rounds, container, projector } = await mounted();
    const init = rounds[0]!.events[0]!;
    await projector.onEvent(init);
    const n1 = container.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
    projector.onReset?.();
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
  });

  it('새 판의 걸음 0 에 앞 판의 결론이 남지 않는다', async () => {
    const { rounds, container, projector } = await mounted();
    for (const e of rounds[0]!.events) await projector.onEvent(e);
    const svg = container.querySelector('svg')!;
    const text = (): string => svg.textContent ?? '';
    expect(text()).toContain('Stopped');
    const checkStart = async (round: FacetRuntimeEvent[]): Promise<void> => {
      const startAt = round.findIndex((e) => e.type === 'start');
      for (const e of round.slice(0, startAt + 1)) await projector.onEvent(e);
      expect(text()).not.toContain('Repeats');
      expect(text()).not.toContain('Stopped');
      const visibleLines = [...svg.querySelectorAll('line')].filter(
        (l) => l.getAttribute('visibility') === 'visible' && l.getAttribute('stroke-width') !== '0.6',
      );
      expect(visibleLines).toHaveLength(0);
      const bars = [...svg.querySelectorAll('rect')].filter((r) => r.getAttribute('fill-opacity') === '0.75');
      expect(bars.every((r) => r.getAttribute('height') === '0')).toBe(true);
      for (const e of round.slice(startAt + 1)) await projector.onEvent(e);
    };
    // 멈춤 판 뒤의 걸음 0, 되풀이 판 뒤의 걸음 0
    await checkStart(rounds[1]!.events);
    expect(text()).toContain('Repeats');
    await checkStart(rounds[2]!.events);
  });
});

// @vitest-environment happy-dom
/**
 * cross-validation 고유의 주장 — 사양 표 대조 · IR ↔ algorithm 전 조합 · 차례를 섞어도 같음 · 회차별 계기 ·
 * 동률 · 걸음과 phase 차례 · 첫 그림의 멱등.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  crossValidationAlgorithm,
  crossValidationFacet,
  crossValidationImperativeIR,
  crossValidationProjector,
  crossValidationStageView,
  foldScore,
  scoreSpread,
  splitScores,
  type CrossValidationData,
} from '../src/index.js';

const data = crossValidationFacet.initialData as CrossValidationData;

/** 사양의 실측표 — 나누기마다 섞음 가 … 아 의 점수와 가장 낮음 · 가장 높음 · 배운 횟수 */
const TABLE = [
  { scores: [100, 100, 100, 100, 50, 50, 75, 75], lo: 50, hi: 100, used: 1 },
  { scores: [80, 80, 80, 85, 85, 70, 75, 85], lo: 70, hi: 85, used: 2 },
  { scores: [85, 80, 80, 80, 80, 80, 80, 80], lo: 80, hi: 85, used: 5 },
  { scores: [80, 80, 80, 80, 80, 80, 80, 80], lo: 80, hi: 80, used: 10 },
  { scores: [80, 80, 80, 80, 80, 80, 80, 80], lo: 80, hi: 80, used: 20 },
];

function irScore(xs: number[], ys: number[], order: number[], k: number, used: number): number {
  const v = runIR(crossValidationImperativeIR, 'scorePercent', [xs, ys, order, k, used]);
  if (typeof v !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return v;
}

describe('cross-validation — 셈', () => {
  it('데이터와 사다리의 크기 — 커지면 먼저 깨진다', () => {
    expect(data.xs).toHaveLength(20);
    expect(data.ys).toHaveLength(20);
    expect(data.orders).toHaveLength(8);
    for (const o of data.orders) expect([...o].sort((a, b) => a - b)).toEqual([...Array(20).keys()]);
    expect(data.splitLadder).toEqual([
      { k: 5, used: 1 },
      { k: 2, used: 2 },
      { k: 5, used: 5 },
      { k: 10, used: 10 },
      { k: 20, used: 20 },
    ]);
    const controls = (crossValidationFacet.blocks.controls as { controls: { action: string; segments?: { value: number }[] }[] })
      .controls;
    const knob = controls.find((c) => c.action === 'split');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.splitLadder.map((_, i) => i));
    expect(data.splitLadder[data.splitLadder.length - 1]).toEqual({ k: 20, used: 20 });
  });

  it('사양 표와 같다 — 다섯 나누기 × 여덟 섞음', () => {
    TABLE.forEach((row, split) => {
      const scores = splitScores(data, split);
      expect(scores).toEqual(row.scores);
      const s = scoreSpread(scores);
      expect([s.lo, s.hi]).toEqual([row.lo, row.hi]);
      expect(data.splitLadder[split]?.used).toBe(row.used);
    });
    // 섞음 가 의 맞힘
    const first = data.orders[0] as number[];
    expect(data.splitLadder.map((r) => foldScore(data.xs, data.ys, first, r.k, r.used).ok)).toEqual([4, 16, 17, 16, 16]);
    expect(data.splitLadder.map((r) => foldScore(data.xs, data.ys, first, r.k, r.used).n)).toEqual([4, 20, 20, 20, 20]);
  });

  it('IR 이 모든 나누기 × 섞음에서 algorithm 의 점수와 같다 · scoreSpread 가 폭과 같다', () => {
    data.splitLadder.forEach((r, split) => {
      const scores = splitScores(data, split);
      const ir = data.orders.map((o) => irScore(data.xs, data.ys, o, r.k, r.used));
      expect(ir).toEqual(scores);
      const width = runIR(crossValidationImperativeIR, 'scoreSpread', [scores, scores.length]);
      expect(width).toBe(scoreSpread(scores).width);
    });
  });

  it('항목 목록의 자리를 뒤집고 섞은 차례를 옮겨도 같다 (TS · IR)', () => {
    const perm = [...Array(20).keys()].reverse();
    const inv = new Map(perm.map((old, now) => [old, now]));
    const xs2 = perm.map((q) => data.xs[q] as number);
    const ys2 = perm.map((q) => data.ys[q] as number);
    for (const r of data.splitLadder) {
      for (const o of data.orders) {
        const o2 = o.map((i) => inv.get(i) as number);
        const base = foldScore(data.xs, data.ys, o, r.k, r.used);
        expect(foldScore(xs2, ys2, o2, r.k, r.used).pct).toBe(base.pct);
        expect(irScore(xs2, ys2, o2, r.k, r.used)).toBe(base.pct);
      }
    }
  });

  it('한 번 떼기의 점수 = 폴드 5 의 첫 폴드 점수', () => {
    for (const o of data.orders) {
      const once = foldScore(data.xs, data.ys, o, 5, 1);
      const five = foldScore(data.xs, data.ys, o, 5, 5);
      expect(once.ok).toBe(five.calls.filter((c) => c.fold === 0 && c.right).length);
      expect(once.cuts[0]).toBe(five.cuts[0]);
    }
  });

  it('폴드 k(≥ 2)에서는 스무 항목이 한 번씩 시험지에 앉는다', () => {
    for (const r of data.splitLadder.slice(1)) {
      for (const o of data.orders) {
        const items = foldScore(data.xs, data.ys, o, r.k, r.used).calls.map((c) => c.item);
        expect([...items].sort((a, b) => a - b)).toEqual([...Array(20).keys()]);
      }
    }
  });

  it('가름점과 같은 항목 — TS 는 던지고 IR 은 −1', () => {
    // 첫 폴드(자리 0 … 3)를 빼면 부류 0 은 모두 2, 부류 1 은 모두 4 → 가름점 3. 시험지 항목이 3 이다
    const xs = [3, 3, 3, 3, ...Array(8).fill(2), ...Array(8).fill(4)];
    const ys = [0, 0, 1, 1, ...Array(8).fill(0), ...Array(8).fill(1)];
    const order = [...Array(20).keys()];
    expect(() => foldScore(xs, ys, order, 5, 1)).toThrow();
    expect(irScore(xs, ys, order, 5, 1)).toBe(-1);
  });

  it('모르는 부류 — TS 는 던지고 IR 은 −1', () => {
    const ys = [...data.ys];
    ys[19] = 2;
    const order = data.orders[0] as number[];
    expect(() => foldScore(data.xs, ys, order, 5, 5)).toThrow();
    expect(irScore(data.xs, ys, order, 5, 5)).toBe(-1);
  });
});

/** 알고리즘을 손잡이 차례대로 돌려 자취와 계기를 모은다 */
async function drive(inputs: number[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const rounds: { events: FacetRuntimeEvent[]; metrics: Record<string, number> }[] = [];
  let current: FacetRuntimeEvent[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx: ReactiveContext<CrossValidationData> = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e) {
      events.push(e);
      current.push(e);
      if (e.type === 'spread') {
        rounds.push({ events: current, metrics: Object.fromEntries(metrics) });
        current = [];
      }
    },
    metric(name, delta) {
      if (delta === 'inc') throw new Error('inc 를 쓰지 않는다');
      metrics.set(name, (metrics.get(name) ?? 0) + delta);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput<T>() {
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        return { type: 'noop' } as T;
      }
      return { type: 'split', payload: { value: v, segmentIndex: v } } as T;
    },
    pollInput() {
      return null;
    },
  } as ReactiveContext<CrossValidationData>;
  await crossValidationAlgorithm(ctx);
  return { events, rounds };
}

describe('cross-validation — 걸음과 계기', () => {
  it('회차별 계기 0 → 2 → 0', async () => {
    const { rounds } = await drive([2, 0]);
    expect(rounds.map((r) => r.metrics['lowest-score'])).toEqual([50, 80, 50]);
    expect(rounds.map((r) => r.metrics['highest-score'])).toEqual([100, 85, 100]);
    expect(rounds.map((r) => r.metrics['fits-per-shuffle'])).toEqual([1, 5, 1]);
  });

  it('한 판 = 걸음 12 (걸음 0 포함) · 걸음 이벤트마다 바로 앞이 그 걸음의 phase', async () => {
    const { rounds } = await drive([1, 2, 3, 4]);
    expect(rounds).toHaveLength(5);
    for (const r of rounds) {
      const steps = r.events.filter((e) => !e.silent);
      expect(steps.map((e) => e.type)).toEqual([
        'deal',
        'fit',
        'judge',
        ...Array(7).fill('shuffle'),
        'spread',
      ]);
      expect(steps.length + 1).toBe(12);
      const want = ['split', 'fit', 'judge', ...Array(7).fill('judge'), 'spread'];
      steps.forEach((e, i) => {
        const at = r.events.indexOf(e);
        const before = r.events[at - 1];
        expect(before?.type).toBe('phase');
        expect((before?.payload as { phase: string }).phase).toBe(want[i]);
      });
      expect(r.events[0]?.type).toBe('cv-start');
      expect(r.events[0]?.silent).toBe(true);
    }
  });

  it('판의 점수가 사양 표와 같다', async () => {
    const { rounds } = await drive([1, 2, 3, 4]);
    rounds.forEach((r, split) => {
      const pcts = r.events
        .filter((e) => e.type === 'judge' || e.type === 'shuffle')
        .map((e) => (e.payload as { pct: number }).pct);
      expect(pcts).toEqual(TABLE[split]?.scores);
      const spread = r.events.find((e) => e.type === 'spread')?.payload as { lo: number; hi: number; width: number };
      expect(spread).toEqual({ lo: TABLE[split]?.lo, hi: TABLE[split]?.hi, width: (TABLE[split]?.hi ?? 0) - (TABLE[split]?.lo ?? 0) });
    });
  });
});

describe('cross-validation — 손잡이 입력', () => {
  it('제 손잡이 값이 사다리 밖이면 던진다', async () => {
    await expect(drive([7])).rejects.toThrow();
  });
});

describe('cross-validation — 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같고, 되짚기(onReset)가 무대를 비운다', async () => {
    const { rounds } = await drive([2]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(crossValidationStageView, container, { config: {}, isInstant: () => true });
    const projector = crossValidationProjector({ stage }, { getSpeed: () => 1, t: (_k, en) => en });
    const first = rounds[0]?.events ?? [];
    const init = first[0] as FacetRuntimeEvent;
    projector.onEvent(init);
    const once = container.querySelectorAll('*').length;
    projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    for (const e of first.slice(1)) await projector.onEvent(e);
    // 둘째 판으로 — 앞 판의 점은 빈 원으로 남되 번호 글자는 걷힌다
    const second = rounds[1]?.events ?? [];
    projector.onEvent(second[0] as FacetRuntimeEvent);
    const labels = [...container.querySelectorAll('circle + text')].map((n) => n.textContent);
    expect(labels.every((s) => s === '')).toBe(true);
    projector.onReset?.();
    projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    stage.destroy();
  });
});

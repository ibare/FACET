// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  allFits,
  overfittingAlgorithm,
  overfittingFacet,
  overfittingImperativeIR,
  overfittingProjector,
  overfittingStageView,
  pointsFor,
  trainAndVal,
  type OverfittingData,
} from '../src/index.js';

const data = overfittingFacet.initialData as OverfittingData;
const vx = data.val.map((v) => v[0]);
const vy = data.val.map((v) => v[1]);

/** 사양의 실측표 (훈련 MSE / 검증 MSE, 둘째 자리) — 대조용 */
const TABLE: Record<number, string[]> = {
  8: ['2.27/3.23', '1.50/2.94', '0.12/0.48', '0.10/0.53', '0.10/0.61', '0.09/0.62', '0.06/1.70'],
  16: ['2.03/3.21', '1.84/2.85', '0.15/0.42', '0.15/0.42', '0.14/0.38', '0.12/0.52', '0.12/0.55'],
  32: ['2.90/3.20', '2.60/2.82', '0.32/0.42', '0.32/0.42', '0.32/0.41', '0.31/0.43', '0.31/0.43'],
};

function irErrors(xs: number[], ys: number[], d: number): { train: number; val: number; ret: number } {
  const M = new Array<number>((d + 1) * (d + 2)).fill(0);
  const c = new Array<number>(d + 1).fill(0);
  const errs = [0, 0];
  const ret = runIR(overfittingImperativeIR, 'trainAndVal', [xs, ys, vx, vy, d, M, c, errs]) as number;
  return { train: errs[0]!, val: errs[1]!, ret };
}

/** 결정적 섞기 — 차례를 바꿔 넣어 보려는 것뿐이다 */
function shuffled<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('overfitting — 데이터와 사다리', () => {
  it('훈련 서른둘 · n 8 은 여덟 · n 16 은 열여섯 · 검증 스물', () => {
    expect(data.train).toHaveLength(32);
    expect(pointsFor(data.train, 8).xs).toHaveLength(8);
    expect(pointsFor(data.train, 16).xs).toHaveLength(16);
    expect(pointsFor(data.train, 32).xs).toHaveLength(32);
    expect(data.val).toHaveLength(20);
  });

  it('사다리가 손잡이 구간 값과 같다', () => {
    const controls = (overfittingFacet.blocks.controls as { controls: { action?: string; segments?: { value: number }[] }[] }).controls;
    const seg = (action: string) => controls.find((c) => c.action === action)?.segments?.map((s) => s.value);
    expect(seg('points')).toEqual(data.pointsLadder);
    expect(seg('degree')).toEqual(data.degreeLadder);
    expect(data.pointsLadder.at(-1)).toBe(32);
    expect(data.degreeLadder.at(-1)).toBe(6);
  });
});

describe('overfitting — 셈', () => {
  it('스물한 조합이 사양의 실측표와 같다 (피벗 동률 · 0 피벗 없음 — allFits 가 던지지 않는다)', () => {
    const { fits } = allFits(data);
    for (const n of data.pointsLadder) {
      data.degreeLadder.forEach((d, i) => {
        const fit = fits.get(`${n}:${d}`)!;
        expect(`${fit.train.toFixed(2)}/${fit.val.toFixed(2)}`, `n ${n} d ${d}`).toBe(TABLE[n]![i]);
      });
    }
  });

  it('훈련 오차는 차수와 함께 엄격히 준다 · 검증이 가장 낮은 차수는 8 → 2 · 16 → 4 · 32 → 4', () => {
    const { fits } = allFits(data);
    const best: Record<number, number> = {};
    for (const n of data.pointsLadder) {
      const tr = data.degreeLadder.map((d) => fits.get(`${n}:${d}`)!.train);
      for (let i = 0; i + 1 < tr.length; i += 1) expect(tr[i]!).toBeGreaterThan(tr[i + 1]!);
      const va = data.degreeLadder.map((d) => fits.get(`${n}:${d}`)!.val);
      best[n] = data.degreeLadder[va.indexOf(Math.min(...va))]!;
    }
    expect(best).toEqual({ 8: 2, 16: 4, 32: 4 });
  });

  it('차수 6 계수 (n 8) 와 세로 범위가 대조와 같다', () => {
    const { fits, bounds } = allFits(data);
    expect(fits.get('8:6')!.coefficients.map((c) => c.toFixed(3))).toEqual(
      ['6.333', '0.831', '-13.753', '5.851', '34.913', '-8.599', '-32.341'],
    );
    expect(bounds.yLo.toFixed(2)).toBe('-2.26');
    expect(bounds.yHi).toBe(7.6);
    expect(bounds.xLo).toBe(-0.95);
    expect(bounds.xHi).toBe(0.95);
  });

  it('① IR trainAndVal 의 두 오차가 스물한 조합 모두에서 algorithm 과 전 정밀도로 같다', () => {
    for (const n of data.pointsLadder) {
      const { xs, ys } = pointsFor(data.train, n);
      for (const d of data.degreeLadder) {
        const ts = trainAndVal(xs, ys, vx, vy, d);
        const ir = irErrors(xs, ys, d);
        expect(ir.train, `n ${n} d ${d} 훈련`).toBe(ts.train);
        expect(ir.val, `n ${n} d ${d} 검증`).toBe(ts.val);
        expect(ir.ret).toBe(ts.val);
      }
    }
  });

  it('② 훈련 점 차례를 섞어 넣어도 둘째 자리 표시가 같고, 섞은 채로도 IR 과 algorithm 이 같다', () => {
    for (const n of data.pointsLadder) {
      const { xs, ys } = pointsFor(data.train, n);
      for (const seed of [3, 11, 29]) {
        const order = shuffled(xs.map((_, i) => i), seed);
        const sx = order.map((i) => xs[i]!);
        const sy = order.map((i) => ys[i]!);
        for (const d of data.degreeLadder) {
          const base = trainAndVal(xs, ys, vx, vy, d);
          const mixed = trainAndVal(sx, sy, vx, vy, d);
          expect(mixed.train.toFixed(2)).toBe(base.train.toFixed(2));
          expect(mixed.val.toFixed(2)).toBe(base.val.toFixed(2));
          const ir = irErrors(sx, sy, d);
          expect(ir.train).toBe(mixed.train);
          expect(ir.val).toBe(mixed.val);
        }
      }
    }
  });
});

type Log = { events: FacetRuntimeEvent[]; metrics: Record<string, number>[] };

/** 가짜 reactive 문맥 — 판 머리마다 계기 값을 적고, 입력이 떨어지면 취소한다 */
async function play(inputs: { type: string; value: number }[]): Promise<Log> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number>[] = [];
  const now: Record<string, number> = {};
  let cancelled = false;
  const queue = inputs.slice();
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      // 판 머리(걸음 0)의 계기 값
      if (e.type === 'init' || e.type === 'round') metrics.push({ ...now });
    },
    metric(name: string, delta: number | 'inc') {
      now[name] = (now[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        return { type: 'none' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await overfittingAlgorithm(ctx as unknown as FacetContext<OverfittingData>);
  return { events, metrics };
}

describe('overfitting — 재생', () => {
  it('③ 회차별 계기 8·6 → 32·6 → 8·6 에서 train-points 8 · 32 · 8, coefficients 7', async () => {
    const { metrics } = await play([
      { type: 'points', value: 32 },
      { type: 'points', value: 8 },
    ]);
    expect(metrics.map((m) => m['train-points'])).toEqual([8, 32, 8]);
    expect(metrics.map((m) => m['coefficients'])).toEqual([7, 7, 7]);
  });

  it('차수를 돌리면 coefficients 가 d + 1 · 사다리 밖 값과 남의 입력은 흘린다', async () => {
    const { metrics, events } = await play([
      { type: 'degree', value: 2 },
      { type: 'degree', value: 9 },
      { type: 'other', value: 1 },
      { type: 'degree', value: 0 },
    ]);
    expect(metrics.map((m) => m['coefficients'])).toEqual([7, 3, 1]);
    expect(events.filter((e) => e.type === 'round')).toHaveLength(2);
  });

  it('한 판은 네 걸음이고, 걸음 1 · 2 · 3 의 발신 바로 앞이 그 걸음의 phase 다', async () => {
    const { events } = await play([{ type: 'points', value: 16 }]);
    const steps = events.filter((e) => !e.silent).map((e) => e.type);
    expect(steps).toEqual(['fit', 'train-err', 'val-err', 'round', 'fit', 'train-err', 'val-err']);
    expect(events[0]!.type).toBe('init');
    events.forEach((e, i) => {
      const want = { fit: 'fit', 'train-err': 'train-err', 'val-err': 'val-err' }[e.type as 'fit'];
      if (want) {
        const prev = events[i - 1]!;
        expect(prev.type).toBe('phase');
        expect((prev.payload as { phase: string }).phase).toBe(want);
      }
    });
  });

  it('캡션의 오차가 그 판의 조합 값이다 (n 32 · d 6 → 0.31 / 0.43)', async () => {
    const { events } = await play([{ type: 'points', value: 32 }]);
    const vals = events.filter((e) => e.type === 'val-err').map((e) => e.payload as { mse: number; trainMse: number });
    expect(vals.map((v) => `${v.trainMse.toFixed(2)}/${v.mse.toFixed(2)}`)).toEqual(['0.06/1.70', '0.31/0.43']);
  });
});

describe('overfitting — 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같고, reset 뒤 다시 먹이면 처음과 같다', async () => {
    const { events } = await play([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(overfittingStageView, container, { config: {}, locale: 'ko' });
    const projector = overfittingProjector({ stage }, { getSpeed: () => 1000, t: (_k, f) => f });
    const init = events[0]!;
    await projector.onEvent(init);
    const svg = container.querySelector('svg')!;
    const once = svg.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(svg.querySelectorAll('*').length).toBe(once);
    for (const e of events.slice(1)) await projector.onEvent(e);
    projector.onReset?.();
    await projector.onEvent(init);
    expect(svg.querySelectorAll('*').length).toBe(once);
    stage.destroy();
  });

  it('마운트는 initialData 없이도 던지지 않는다', () => {
    const container = document.createElement('div');
    const stage = mountView(overfittingStageView, container, { config: {} });
    stage.destroy();
  });
});

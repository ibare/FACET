// @vitest-environment happy-dom
/**
 * 경사 하강 — facet 고유의 주장.
 *
 *   IR ↔ algorithm   열두 조합 모두에서 runIR('descend') 의 t 와 path[0..t] 가 algorithm 의 걸음과 같다
 *   사양 표          끝난 모양 · 갱신 수 · 첫 갱신 뒤 자리 · 끝 자리 · 언덕 넘음 · 걸음 차례 대조
 *   계기 회차        0.15 → 0.35 → 0.15 로 돌려 회차마다 updates 10 · 3 · 10, hump-crossings 1 · 3 · 1
 *   phase 자리       걸음 이벤트마다 바로 앞이 그 걸음의 phase (걸음 0 은 phase 없음)
 *   무대             첫 그림을 두 번 먹여도 요소 수가 같다 · reset 뒤 비워진다
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  descend,
  fx,
  gradientDescentAlgorithm,
  gradientDescentFacet,
  gradientDescentImperativeIR,
  gradientDescentProjector,
  gradientDescentStageView,
  planRun,
  scanLandscape,
  type GradientDescentData,
} from '../src/index.js';

const data = gradientDescentFacet.initialData as GradientDescentData;

type Input = { type: string; payload: Record<string, unknown> };
type Round = { events: FacetRuntimeEvent[]; metrics: Map<string, number> };

/** algorithm 을 입력 차례대로 돌려 판마다 이벤트 · 계기를 모은다. */
async function drive(inputs: Input[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let events: FacetRuntimeEvent[] = [];
  const queue = [...inputs];
  let done!: () => void;
  const idle = new Promise<void>((r) => (done = r));
  const ctx = {
    data: JSON.parse(JSON.stringify(data)) as GradientDescentData,
    cancelled: false,
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    async sleep() {
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput(): Promise<Input> {
      rounds.push({ events, metrics: new Map(totals) });
      events = [];
      const next = queue.shift();
      if (!next) {
        done();
        return new Promise<never>(() => {});
      }
      return next;
    },
  };
  void gradientDescentAlgorithm(ctx as never);
  await idle;
  return rounds;
}

const pay = (e: FacetRuntimeEvent) => e.payload as Record<string, unknown>;
const steps = (r: Round) => r.events.filter((e) => e.type === 'update').map(pay);
const settleOf = (r: Round) => pay(r.events.find((e) => e.type === 'settle')!);

const ETAS = [0.02, 0.1, 0.15, 0.2, 0.25, 0.35];
const STARTS = [1.6, 1.4];

/** 모든 조합을 한 판씩 — 첫 판은 기본값(0.15 × 1.6) */
function allCombos(): { inputs: Input[]; order: [number, number][] } {
  const inputs: Input[] = [];
  for (const s of STARTS) {
    inputs.push({ type: 'start', payload: { value: s } });
    for (const e of ETAS) inputs.push({ type: 'eta', payload: { value: e } });
  }
  // 입력 하나마다 한 판 (start 입력 판도 한 판으로 친다)
  const realOrder: [number, number][] = [[0.15, 1.6]];
  let eta = 0.15;
  let start = 1.6;
  for (const i of inputs) {
    if (i.type === 'eta') eta = i.payload.value as number;
    else start = i.payload.value as number;
    realOrder.push([eta, start]);
  }
  return { inputs, order: realOrder };
}

describe('gradient-descent — 사다리와 격자', () => {
  it('사다리가 segments 와 같다', () => {
    const bar = gradientDescentFacet.blocks.controls as { controls: Record<string, unknown>[] };
    const knob = (name: string) =>
      (bar.controls.find((c) => c.name === name)!.segments as { value: number }[]).map((s) => s.value);
    expect(knob('eta')).toEqual(data.etaLadder);
    expect(knob('start')).toEqual(data.startLadder);
    expect(data.etaLadder).toHaveLength(6);
    expect(data.etaLadder[5]).toBe(0.35);
    expect(data.startLadder).toEqual([1.6, 1.4]);
  });

  it('격자 훑기의 두 바닥과 언덕 (동률 없음)', () => {
    const land = scanLandscape(data);
    expect(land.samples).toHaveLength(401);
    expect(fx(land.deep.w, 2)).toBe('−1.06');
    expect(fx(land.deep.loss, 2)).toBe('−1.51');
    expect(fx(land.shallow.w, 2)).toBe('0.93');
    expect(fx(land.shallow.loss, 2)).toBe('−0.52');
    expect(fx(land.hump.w, 2)).toBe('0.13');
    expect(fx(land.hump.loss, 2)).toBe('0.03');
    expect(land.window.wMin).toBe(-2);
    expect(land.window.wMax).toBe(2);
  });
});

describe('gradient-descent — 사양 표', () => {
  const TABLE: Record<string, [string, number, string, string, number]> = {
    // 끝난 모양 · 갱신 수 · 첫 갱신 뒤 · 끝 자리 · 언덕 넘음
    '1.6x0.02': ['shallow', 38, '1.39', '0.93', 0],
    '1.6x0.1': ['shallow', 9, '0.55', '0.93', 0],
    '1.6x0.15': ['deep', 10, '0.03', '−1.06', 1],
    '1.6x0.2': ['deep', 38, '−0.50', '−1.06', 1],
    '1.6x0.25': ['cap', 60, '−1.02', '−1.21', 1],
    '1.6x0.35': ['blowup', 3, '−2.07', '−519.63', 3],
    '1.4x0.02': ['shallow', 37, '1.28', '0.93', 0],
    '1.4x0.1': ['shallow', 6, '0.81', '0.93', 0],
    '1.4x0.15': ['shallow', 6, '0.52', '0.93', 0],
    '1.4x0.2': ['shallow', 7, '0.22', '0.93', 0],
    '1.4x0.25': ['cap', 60, '−0.07', '−1.21', 1],
    '1.4x0.35': ['cap', 60, '−0.66', '1.03', 2],
  };

  it('열두 조합의 끝난 모양 · 갱신 수 · 자리 · 언덕 넘음', () => {
    for (const s of STARTS) {
      for (const e of ETAS) {
        const plan = planRun(data, e, s);
        const [shape, n, first, last, cross] = TABLE[`${s}x${e}`]!;
        expect([plan.outcome, plan.run.t], `${s}x${e}`).toEqual([shape, n]);
        expect(fx(plan.run.path[1]!, 2)).toBe(first);
        expect(fx(plan.last, 2)).toBe(last);
        expect(plan.crossings).toBe(cross);
      }
    }
  });

  it('출발만 바꿔 끝난 모양이 바뀌는 칸은 0.15 · 0.2 · 0.35', () => {
    const differ = ETAS.filter((e) => planRun(data, e, 1.6).outcome !== planRun(data, e, 1.4).outcome);
    expect(differ).toEqual([0.15, 0.2, 0.35]);
  });

  it('깊은 바닥 칸은 첫 갱신에 언덕 왼쪽으로 가 돌아오지 않고, 얕은 바닥 칸은 언덕 왼쪽에 가지 않는다', () => {
    for (const s of STARTS) {
      for (const e of ETAS) {
        const p = planRun(data, e, s);
        const h = p.land.hump.w;
        const later = p.run.path.slice(1);
        if (p.outcome === 'deep') expect(later.every((w) => w < h)).toBe(true);
        if (p.outcome === 'shallow') expect(p.run.path.every((w) => w >= h)).toBe(true);
        if (p.outcome === 'deep' || p.outcome === 'shallow') {
          const spot = p.outcome === 'deep' ? p.land.deep : p.land.shallow;
          expect(Math.abs(p.last - spot.w)).toBeLessThan(0.01);
        }
        if (p.outcome !== 'blowup') expect(p.run.path.every((w) => w >= -2 && w <= 2)).toBe(true);
      }
    }
  });

  it('못 멈춤 칸의 끝 여섯 자리와 끝 |g|', () => {
    const tail = (e: number, s: number) => planRun(data, e, s).run.path.slice(-6).map((w) => fx(w, 2));
    expect(tail(0.25, 1.6)).toEqual(['−0.77', '−1.21', '−0.77', '−1.21', '−0.77', '−1.21']);
    expect(tail(0.25, 1.4)).toEqual(['−0.77', '−1.21', '−0.77', '−1.21', '−0.77', '−1.21']);
    expect(tail(0.35, 1.4)).toEqual(['0.76', '1.03', '0.76', '1.03', '0.76', '1.03']);
  });

  it('기본값 1.6 × 0.15 의 걸음 차례 (걸음 12)', async () => {
    const [r] = await drive([]);
    const st = pay(r!.events.find((e) => e.type === 'start')!);
    expect([fx(st.w as number, 2), fx(st.loss as number, 2), fx(st.grad as number, 2)]).toEqual(['1.60', '2.23', '10.48']);
    const ups = steps(r!);
    expect(ups.map((u) => fx(u.to as number, 2))).toEqual([
      '0.03', '−0.03', '−0.12', '−0.27', '−0.50', '−0.80', '−1.05', '−1.06', '−1.06', '−1.06',
    ]);
    expect(ups.map((u) => fx(u.loss as number, 2)).slice(0, 8)).toEqual([
      '0.01', '−0.02', '−0.09', '−0.28', '−0.69', '−1.27', '−1.51', '−1.51',
    ]);
    expect(ups.slice(7).map((u) => fx(u.grad as number, 2))).toEqual(['0.09', '−0.04', '0.01']);
    expect(ups[0]!.crossed).toBe(true);
    const end = settleOf(r!);
    expect(end.outcome).toBe('deep');
    expect(fx(end.absGrad as number, 3)).toBe('0.006');
    // 걸음 수 = 걸음 0 + 갱신 + 끝 걸음
    const stepEvents = r!.events.filter((e) => e.silent !== true);
    expect(stepEvents).toHaveLength(12);
  });
});

describe('gradient-descent — IR ↔ algorithm', () => {
  it('열두 조합 모두에서 runIR 의 t 와 path 가 algorithm 의 걸음과 같다', async () => {
    const { inputs, order } = allCombos();
    const rounds = await drive(inputs);
    expect(rounds).toHaveLength(order.length);
    const seen = new Set<string>();
    rounds.forEach((r, i) => {
      const [eta, start] = order[i]!;
      seen.add(`${eta}x${start}`);
      const path = new Array<number>(data.maxSteps + 1).fill(0);
      path[0] = start;
      const t = runIR(gradientDescentImperativeIR, 'descend', [path, eta, data.maxSteps, data.stopBelow, data.blowUp]);
      const ups = steps(r);
      expect(t, `${eta}x${start}`).toBe(ups.length);
      expect(r.metrics.get('updates')).toBe(ups.length);
      expect(path.slice(1, (t as number) + 1)).toEqual(ups.map((u) => u.to));
      expect(path.slice(0, (t as number) + 1)).toEqual(descend(start, eta, data.maxSteps, data.stopBelow, data.blowUp).path);
      expect(settleOf(r).t).toBe(t);
    });
    expect(seen.size).toBe(12);
  });
});

describe('gradient-descent — 계기와 phase', () => {
  it('0.15 → 0.35 → 0.15 로 돌려 회차마다 계기가 사양 표와 같다', async () => {
    const rounds = await drive([
      { type: 'eta', payload: { value: 0.35 } },
      { type: 'eta', payload: { value: 0.15 } },
    ]);
    expect(rounds.map((r) => r.metrics.get('updates'))).toEqual([10, 3, 10]);
    expect(rounds.map((r) => r.metrics.get('hump-crossings'))).toEqual([1, 3, 1]);
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 다', async () => {
    const { inputs } = allCombos();
    const rounds = await drive(inputs);
    const endPhase = { deep: 'gd-stop', shallow: 'gd-stop', cap: 'gd-cap', blowup: 'gd-blowup' } as const;
    for (const r of rounds) {
      r.events.forEach((e, i) => {
        const prev = r.events[i - 1];
        const prevPhase = prev?.type === 'phase' ? (pay(prev).phase as string) : null;
        if (e.type === 'start') expect(prevPhase).toBeNull();
        if (e.type === 'update') expect(prevPhase).toBe('gd-update');
        if (e.type === 'settle') expect(prevPhase).toBe(endPhase[pay(e).outcome as keyof typeof endPhase]);
      });
    }
  });

  it('사다리 밖의 값은 받지 않는다', async () => {
    const ctx = {
      data: JSON.parse(JSON.stringify(data)) as GradientDescentData,
      cancelled: false,
      metric() {},
      async emit() {},
      async sleep() {
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        return { type: 'eta', payload: { value: 0.3 } };
      },
    };
    await expect(gradientDescentAlgorithm(ctx as never)).rejects.toThrow(/사다리/);
  });
});

describe('gradient-descent — 무대', () => {
  async function feed(inputs: Input[]) {
    const rounds = await drive(inputs);
    return rounds.flatMap((r) => r.events);
  }

  it('첫 그림을 두 번 먹여도 요소 수가 같고, reset 뒤에는 비워진다', async () => {
    const container = document.createElement('div');
    const stage = mountView(gradientDescentStageView, container, { config: {}, initialData: data, locale: 'ko' });
    const proj = gradientDescentProjector({ stage }, { getSpeed: () => 1, t: (_k, en) => en });
    const events = await feed([]);
    const init = events.find((e) => e.type === 'init')!;
    proj.onEvent(init);
    const once = container.querySelectorAll('*').length;
    proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    for (const e of events) if (e.type !== 'init') proj.onEvent(e);
    expect(container.textContent).toContain('Settled in the deep valley');
    proj.onReset?.();
    proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    stage.destroy();
  });

  it('곡선 밖 판은 가장자리 화살표와 w 값만 적는다', async () => {
    const container = document.createElement('div');
    const stage = mountView(gradientDescentStageView, container, { config: {}, initialData: data, locale: 'en' });
    const proj = gradientDescentProjector({ stage }, { getSpeed: () => 1, t: (_k, en, v) => {
      let s = en;
      for (const [k, x] of Object.entries(v ?? {})) s = s.replace(`{${k}}`, String(x));
      return s;
    } });
    const rounds = await drive([{ type: 'eta', payload: { value: 0.35 } }]);
    for (const e of rounds[1]!.events) proj.onEvent(e);
    expect(container.textContent).toContain('Left the curve · w = −519.63');
    expect(container.querySelectorAll('polygon').length).toBeGreaterThan(0);
    stage.destroy();
  });
});

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  brdfAlgorithm,
  brdfFacet,
  brdfImperativeIR,
  brdfInitialData,
  brdfProjector,
  brdfStageView,
  computeAxis,
  computeBrdf,
  narrowBrdfData,
  reflectRadiance,
  reflectTotal,
  type BrdfData,
} from '../src/index.js';

const data = narrowBrdfData(brdfInitialData);

/** 사양 실측표 (python3 measure.py brdf) — 봉우리 · 총량 · 반폭각 · α · 거칠기 */
const SPEC: Record<string, { peak: string; total: string; half: number; alpha: string; rough: string }> = {
  'phong:1': { peak: '0.500', total: '1.047', half: 45, alpha: '0.816', rough: '0.904' },
  'phong:4': { peak: '0.500', total: '0.524', half: 29, alpha: '0.577', rough: '0.760' },
  'phong:16': { peak: '0.500', total: '0.175', half: 16, alpha: '0.333', rough: '0.577' },
  'phong:64': { peak: '0.500', total: '0.048', half: 8, alpha: '0.174', rough: '0.417' },
  'phong:256': { peak: '0.500', total: '0.012', half: 4, alpha: '0.088', rough: '0.297' },
  'pbr:1': { peak: '0.107', total: '0.367', half: 64, alpha: '0.816', rough: '0.904' },
  'pbr:4': { peak: '0.215', total: '0.531', half: 48, alpha: '0.577', rough: '0.760' },
  'pbr:16': { peak: '0.645', total: '0.740', half: 26, alpha: '0.333', rough: '0.577' },
  'pbr:64': { peak: '2.363', total: '0.854', half: 13, alpha: '0.174', rough: '0.417' },
  'pbr:256': { peak: '9.239', total: '0.889', half: 7, alpha: '0.088', rough: '0.297' },
};

/** 로브 모양 (세기 ÷ 봉우리, θ = 0 · 15 · 30 · 45 · 60 · 75°) — 사양의 본보기 둘 */
const SPEC_LOBE: Record<string, string> = {
  'phong:16': '1.000 0.555 0.087 0.003 0.000 0.000',
  'pbr:16': '1.000 0.770 0.413 0.198 0.095 0.043',
};

type Control = { action?: string; segments?: { value: number; default?: boolean }[] };
const controls = (brdfFacet.blocks.controls as { controls: Control[] }).controls;
const segs = (action: string) => {
  const c = controls.find((x) => x.action === action);
  if (!c?.segments) throw new Error(`손잡이 ${action} 없음`);
  return c.segments;
};

describe('brdf — 사양 표와 셈한 값', () => {
  it('사다리가 segments 와 같고 크기가 사양대로다', () => {
    expect(segs('set-gloss').map((s) => s.value)).toEqual(data.glossLadder);
    expect(data.glossLadder).toHaveLength(5);
    expect(data.glossLadder[data.glossLadder.length - 1]).toBe(256);
    expect(segs('set-model').map((s) => s.value)).toEqual(data.models.map((_, i) => i));
    expect(data.models).toEqual(['phong', 'pbr']);
    expect(segs('set-gloss').find((s) => s.default)?.value).toBe(data.defaultGloss);
    expect(segs('set-model').find((s) => s.default)?.value).toBe(data.defaultModel);
    expect(data.samples).toBe(2000);
  });

  it('모형 2 × 광택 5 전 칸이 실측표와 같다', () => {
    for (const model of data.models) {
      for (const n of data.glossLadder) {
        const r = computeBrdf(data, model, n);
        const want = SPEC[`${model}:${n}`];
        expect(r.peak.toFixed(3), `${model} ${n} 봉우리`).toBe(want.peak);
        expect(r.total.toFixed(3), `${model} ${n} 총량`).toBe(want.total);
        expect(r.halfWidthShown, `${model} ${n} 반폭각`).toBe(want.half);
        expect(r.alpha.toFixed(3)).toBe(want.alpha);
        expect(r.roughness.toFixed(3)).toBe(want.rough);
        expect(r.samples).toHaveLength(59);
        expect(r.samples[0].deg).toBe(-87);
        expect(r.samples[58].deg).toBe(87);
        const lobe = SPEC_LOBE[`${model}:${n}`];
        if (lobe) {
          const at = (deg: number) => r.samples.find((s) => s.deg === deg)?.shape ?? Number.NaN;
          expect([0, 15, 30, 45, 60, 75].map((d) => at(d).toFixed(3)).join(' ')).toBe(lobe);
        }
      }
    }
  });

  it('동률이 이 데이터에서 걸리지 않는다 — 반폭각 반올림 · 총량 = 1', () => {
    let minHalfGap = Infinity;
    let minTotalGap = Infinity;
    for (const model of data.models) {
      for (const n of data.glossLadder) {
        const r = computeBrdf(data, model, n);
        minHalfGap = Math.min(minHalfGap, Math.abs(r.halfWidthDeg - Math.floor(r.halfWidthDeg) - 0.5));
        minTotalGap = Math.min(minTotalGap, Math.abs(r.total - 1));
      }
    }
    expect(minHalfGap).toBeGreaterThan(0.01); // 가장 가까운 칸: PBR n 256 의 6.52°
    expect(minTotalGap).toBeGreaterThan(0.04); // 가장 가까운 칸: 퐁 n 1 의 1.047
  });

  it('축 — 봉우리 로그 0.1..10 · 총량 0..1.2 와 1 선', () => {
    const all = data.models.flatMap((m) => data.glossLadder.map((n) => computeBrdf(data, m, n)));
    const axis = computeAxis(all);
    expect(axis.peakTicks.map((x) => x.label)).toEqual(['0.1', '1', '10']);
    expect(axis.totalTicks.map((x) => x.label)).toEqual(['0', '0.2', '0.4', '0.6', '0.8', '1.0', '1.2']);
    expect(axis.totalMax).toBe(1.2);
    expect(axis.incoming).toBe(1);
  });
});

describe('brdf — IR 과 algorithm 이 같은 답', () => {
  it('모든 조합에서 총량 · 봉우리가 1e−12 안에서 같다', () => {
    data.models.forEach((model, code) => {
      for (const n of data.glossLadder) {
        const r = computeBrdf(data, model, n);
        const total = runIR(brdfImperativeIR, 'reflectTotal', [code, n, data.ks, data.f0, data.samples]) as number;
        expect(Math.abs(total - r.total)).toBeLessThan(1e-12);
        expect(total.toFixed(3)).toBe(r.total.toFixed(3));
        const peak = runIR(brdfImperativeIR, 'reflectRadiance', [code, 1.0, n, data.ks, data.f0]) as number;
        expect(Math.abs(peak - r.peak)).toBeLessThan(1e-12);
      }
    });
  });

  it('모르는 모형 — TS 는 던지고 IR 은 표지 −1', () => {
    expect(runIR(brdfImperativeIR, 'reflectTotal', [2, 16, data.ks, data.f0, data.samples])).toBe(-1);
    expect(runIR(brdfImperativeIR, 'reflectRadiance', [2, 0.5, 16, data.ks, data.f0])).toBe(-1);
    expect(() => reflectRadiance(2, 0.5, 16, data.ks, data.f0)).toThrow();
    expect(() => reflectTotal(2, 16, data.ks, data.f0, 10)).toThrow();
    expect(() => computeBrdf(data, 'lambert', 16)).toThrow();
  });
});

type Rec =
  | { kind: 'emit'; e: FacetRuntimeEvent }
  | { kind: 'sleep'; ms: number }
  | { kind: 'metric'; name: string; delta: number }
  | { kind: 'wait' };

async function play(inputs: { type: string; payload?: unknown }[], d: BrdfData = data) {
  const log: Rec[] = [];
  const queue = [...inputs];
  const ctx = {
    data: d,
    cancelled: false,
    async emit(e: FacetRuntimeEvent) {
      log.push({ kind: 'emit', e });
    },
    metric(name: string, delta: number | 'inc') {
      log.push({ kind: 'metric', name, delta: delta === 'inc' ? 1 : delta });
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      log.push({ kind: 'wait' });
      const next = queue.shift();
      if (!next) {
        ctx.cancelled = true;
        return { type: '__end' };
      }
      return next;
    },
  };
  await brdfAlgorithm(ctx as never);
  return log;
}

/** 판마다 계기 half-width 의 누적값 (판 머리 · 걸음 2 뒤) */
function roundsOf(log: Rec[]) {
  const rounds: { model: string; n: number; half: number; atHead: number }[] = [];
  let metric = 0;
  for (const r of log) {
    if (r.kind === 'metric' && r.name === 'half-width') metric += r.delta;
    if (r.kind === 'emit' && r.e.type === 'init') {
      const p = r.e.payload as { model: string; n: number };
      rounds.push({ model: p.model, n: p.n, half: Number.NaN, atHead: metric });
    }
    if (r.kind === 'wait') rounds[rounds.length - 1].half = metric;
  }
  return rounds;
}

describe('brdf — 한 판의 차례와 회차별 계기', () => {
  it('init → sleep(stepMs + motionMs) → phase peak, 걸음마다 바로 앞이 그 걸음의 phase', async () => {
    const log = await play([]);
    const seq = log.filter((r) => r.kind !== 'metric');
    expect(seq[0]).toMatchObject({ kind: 'emit', e: { type: 'init', silent: true } });
    expect(seq[1]).toEqual({ kind: 'sleep', ms: data.stepMs + data.motionMs });
    expect(seq[2]).toMatchObject({ kind: 'emit', e: { type: 'phase', payload: { phase: 'peak' } } });
    const emits = log.flatMap((r) => (r.kind === 'emit' ? [r.e] : []));
    for (let i = 0; i < emits.length; i++) {
      const e = emits[i];
      if (e.silent) continue;
      expect(emits[i - 1].type).toBe('phase');
      expect((emits[i - 1].payload as { phase: string }).phase).toBe(e.type);
    }
    expect(emits.filter((e) => !e.silent).map((e) => e.type)).toEqual(['peak', 'lobe', 'integrate']);
    const sleeps = log.flatMap((r) => (r.kind === 'sleep' ? [r.ms] : []));
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(6100);
  });

  it('손잡이 A → B → A — 판마다 계기가 머리에서 0, 걸음 2 뒤에 표의 반폭각', async () => {
    const log = await play([
      { type: 'set-gloss', payload: { value: 256 } },
      { type: 'set-model', payload: { value: 1 } },
      { type: 'other', payload: { value: 99 } },
      { type: 'set-gloss', payload: { value: 16 } },
      { type: 'set-model', payload: { value: 0 } },
      { type: 'set-gloss', payload: { value: 1 } },
    ]);
    const rounds = roundsOf(log);
    expect(rounds.map((r) => `${r.model}:${r.n}`)).toEqual([
      'phong:16',
      'phong:256',
      'pbr:256',
      'pbr:16',
      'phong:16',
      'phong:1',
    ]);
    for (const r of rounds) {
      expect(r.atHead).toBe(0);
      expect(r.half).toBe(SPEC[`${r.model}:${r.n}`].half);
    }
    // 첫 판에 계기가 이름째 실린다
    expect(log.find((r) => r.kind === 'metric')).toEqual({ kind: 'metric', name: 'half-width', delta: 0 });
  });

  it('제 손잡이의 사다리 밖 값은 던진다', async () => {
    await expect(play([{ type: 'set-gloss', payload: { value: 8 } }])).rejects.toThrow();
    await expect(play([{ type: 'set-model', payload: { value: 2 } }])).rejects.toThrow();
    await expect(play([{ type: 'set-gloss', payload: {} }])).rejects.toThrow();
  });
});

describe('brdf — 무대', () => {
  const mount = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(brdfStageView, container, { config: { type: 'brdf-stage' }, initialData: brdfInitialData, locale: 'ko' });
    const proj = brdfProjector({ stage }, { getSpeed: () => 1, t: makeTranslator() });
    return { container, stage, proj };
  };

  it('첫 그림을 두 번 먹여도 요소 수가 같다 (멱등)', async () => {
    const log = await play([]);
    const init = log.find((r) => r.kind === 'emit' && r.e.type === 'init');
    if (!init || init.kind !== 'emit') throw new Error('init 없음');
    const { container, proj } = mount();
    proj.onEvent(init.e);
    const once = container.querySelectorAll('*').length;
    proj.onEvent(init.e);
    expect(container.querySelectorAll('*').length).toBe(once);
  });

  it('한 판을 먹이고 다음 판 머리에서 결론을 걷고 자리만 남긴다 · onReset 이 비운다', async () => {
    const log = await play([{ type: 'set-gloss', payload: { value: 64 } }]);
    const emits = log.flatMap((r) => (r.kind === 'emit' ? [r.e] : []));
    const second = emits.findIndex((e, i) => i > 0 && e.type === 'init');
    const { container, proj } = mount();
    for (const e of emits.slice(0, second)) proj.onEvent(e);
    const q = (role: string) => container.querySelectorAll(`[data-role="${role}"]`).length;
    expect(q('lobe')).toBe(1);
    expect(q('half-width')).toBe(1);
    expect(q('peak-value')).toBe(1);
    expect(q('total-value')).toBe(1);
    expect(container.querySelector('[data-role="total-value"]')?.textContent).toBe('0.175');
    proj.onEvent(emits[second]);
    expect(q('lobe')).toBe(0);
    expect(q('half-width')).toBe(0);
    expect(q('peak-value')).toBe(0);
    expect(q('total-value')).toBe(0);
    expect(q('ghost-lobe')).toBe(1);
    expect(q('ghost-tick')).toBe(2);
    for (const e of emits.slice(second + 1)) proj.onEvent(e);
    expect(container.querySelector('[data-role="total-value"]')?.textContent).toBe('0.048');
    expect(container.querySelector('[data-role="peak-value"]')?.textContent).toBe('0.500');
    proj.onReset?.();
    expect(q('ghost-lobe') + q('lobe') + q('ghost-tick') + q('peak-bar') + q('total-bar')).toBe(0);
  });

  it('퐁 n 1 에서만 1 선 넘음 표지가 선다', async () => {
    const log = await play([{ type: 'set-gloss', payload: { value: 1 } }]);
    const emits = log.flatMap((r) => (r.kind === 'emit' ? [r.e] : []));
    const { container, proj } = mount();
    const second = emits.findIndex((e, i) => i > 0 && e.type === 'init');
    for (const e of emits.slice(0, second)) proj.onEvent(e);
    expect(container.querySelectorAll('[data-role="over-mark"]').length).toBe(0);
    for (const e of emits.slice(second)) proj.onEvent(e);
    expect(container.querySelectorAll('[data-role="over-mark"]').length).toBe(1);
  });

  it('모르는 이벤트는 던진다', () => {
    const { proj } = mount();
    expect(() => proj.onEvent({ type: 'mystery' })).toThrow();
  });
});

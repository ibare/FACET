// @vitest-environment happy-dom
/**
 * integral — facet 고유의 주장을 잠근다.
 *   1. IR ↔ algorithm 18 조합 + 폭 2h 셈이 같다 (차이 0)
 *   2. 표지 — rule 3 에서 TS 는 던지고 IR 은 −1
 *   3. 회차별 계기 · 사다리 = segments[].value
 *   4. phase 는 걸음 발신 앞에 · init → sleep → 첫 phase · 첫 그림 멱등
 *   5. 반올림 경계 셋의 글자 · 사양 표 대조
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  area,
  computeRound,
  flattenTerms,
  formatNumber,
  formatWidth,
  integralAlgorithm,
  integralFacet,
  integralImperativeIR,
  integralProjector,
  integralStageView,
  slope,
  type IntegralData,
} from '../src/index.js';

const data = integralFacet.initialData as IntegralData;
const terms = flattenTerms(data.terms);

type Logged = FacetRuntimeEvent | { type: '__sleep' };

async function play(inputs: { type: string; value: number }[]) {
  const events: Logged[] = [];
  const meters = new Map<string, number>();
  const rounds: { strip: number; evals: number }[] = [];
  let i = 0;
  let cancelled = false;
  const ctx = {
    data: structuredClone(data),
    emit: async (e: FacetRuntimeEvent) => {
      events.push(e);
    },
    metric: (name: string, d: number | 'inc') => {
      if (d === 'inc') throw new Error('inc 를 쓰지 않는다');
      meters.set(name, (meters.get(name) ?? 0) + d);
    },
    get cancelled() {
      return cancelled;
    },
    sleep: async () => {
      events.push({ type: '__sleep' });
      return true;
    },
    pollInput: () => null,
    waitForInput: async () => {
      rounds.push({ strip: meters.get('strip-count') ?? -1, evals: meters.get('curve-evals') ?? -1 });
      const next = inputs[i];
      i += 1;
      if (next) return { type: next.type, payload: { value: next.value } };
      cancelled = true;
      return { type: '__end' };
    },
  };
  await integralAlgorithm(ctx as never);
  return { events, rounds };
}

const RULE_PHASE = ['slope-left', 'slope-right', 'slope-mid'];
const AREA_PHASE = ['area-left', 'area-right', 'area-mid'];

describe('integral — IR 과 algorithm', () => {
  it('18 조합과 폭 2h 셈에서 IR 답이 algorithm 과 같다', () => {
    for (const rule of data.ruleLadder) {
      for (const h of data.widthLadder) {
        const n = (data.hi - data.lo) / h;
        for (const [hh, nn] of [
          [h, n],
          [2 * h, n / 2],
        ] as const) {
          if (!Number.isInteger(nn)) continue;
          const s = runIR(integralImperativeIR, 'slope', [terms, rule, data.a, hh]);
          const a = runIR(integralImperativeIR, 'area', [terms, rule, data.lo, data.hi, nn]);
          expect(s).toBe(slope(terms, rule, data.a, hh));
          expect(a).toBe(area(terms, rule, data.lo, data.hi, nn));
        }
      }
    }
  });

  it('rule 3 — TS 는 던지고 IR 은 −1', () => {
    expect(() => slope(terms, 3, 1, 0.25)).toThrow();
    expect(() => area(terms, 3, 0, 2, 8)).toThrow();
    expect(runIR(integralImperativeIR, 'slope', [terms, 3, 1, 0.25])).toBe(-1);
    expect(runIR(integralImperativeIR, 'area', [terms, 3, 0, 2, 8])).toBe(-1);
  });
});

describe('integral — 사양 표 대조', () => {
  // [잡는 자리, h, 기울기 추정, 기울기 오차, 비, 넓이 추정, 넓이 오차, 비]
  const table: [number, number, string, string, string, string, string, string][] = [
    [0, 1, '1.0000', '−2.0000', '—', '1.0000', '−3.0000', '—'],
    [0, 0.5, '1.7500', '−1.2500', '0.625', '2.2500', '−1.7500', '0.583'],
    [0, 0.25, '2.3125', '−0.6875', '0.550', '3.0625', '−0.9375', '0.536'],
    [0, 0.125, '2.6406', '−0.3594', '0.523', '3.5156', '−0.4844', '0.517'],
    [0, 0.0625, '2.8164', '−0.1836', '0.511', '3.7539', '−0.2461', '0.508'],
    [0, 0.03125, '2.9072', '−0.0928', '0.505', '3.8760', '−0.1240', '0.504'],
    [1, 1, '7.0000', '4.0000', '—', '9.0000', '5.0000', '—'],
    [1, 0.5, '4.7500', '1.7500', '0.438', '6.2500', '2.2500', '0.450'],
    [1, 0.25, '3.8125', '0.8125', '0.464', '5.0625', '1.0625', '0.472'],
    [1, 0.125, '3.3906', '0.3906', '0.481', '4.5156', '0.5156', '0.485'],
    [1, 0.0625, '3.1914', '0.1914', '0.490', '4.2539', '0.2539', '0.492'],
    [1, 0.03125, '3.0947', '0.0947', '0.495', '4.1260', '0.1260', '0.496'],
    [2, 1, '4.0000', '1.0000', '—', '3.5000', '−0.5000', '—'],
    [2, 0.5, '3.2500', '0.2500', '0.250', '3.8750', '−0.1250', '0.250'],
    [2, 0.25, '3.0625', '0.0625', '0.250', '3.9688', '−0.0313', '0.250'],
    [2, 0.125, '3.0156', '0.0156', '0.250', '3.9922', '−0.0078', '0.250'],
    [2, 0.0625, '3.0039', '0.0039', '0.250', '3.9980', '−0.0020', '0.250'],
    [2, 0.03125, '3.0010', '0.0010', '0.250', '3.9995', '−0.0005', '0.250'],
  ];
  it('18 칸의 글자가 사양 표와 같다', () => {
    for (const [rule, h, se, sErr, sr, ae, aErr, ar] of table) {
      const r = computeRound(data, rule, h);
      const ratio = (x: number | null) => (x === null ? '—' : formatNumber(x, 3));
      expect([
        formatNumber(r.slopeEstimate, 4),
        formatNumber(r.slopeError, 4),
        ratio(r.slopeRatio),
        formatNumber(r.areaEstimate, 4),
        formatNumber(r.areaError, 4),
        ratio(r.areaRatio),
      ]).toEqual([se, sErr, sr, ae, aErr, ar]);
      expect(r.evals).toBe(2 + r.n);
    }
  });

  it('반올림 경계 셋 — toFixed 글자', () => {
    expect(formatNumber(0.4375, 3)).toBe('0.438');
    expect(formatNumber(3.96875, 4)).toBe('3.9688');
    expect(formatNumber(-0.03125, 4)).toBe('−0.0313');
    expect(formatNumber(-0.00001, 4)).toBe('0.0000');
    expect(formatWidth(0.25)).toBe('1/4');
    expect(formatWidth(1)).toBe('1');
  });

  it('기본값 조각 높이 여덟', () => {
    const r = computeRound(data, 0, 0.25);
    expect(r.detail.sy.map((y) => formatNumber(y, 4))).toEqual([
      '0.0000', '0.0156', '0.1250', '0.4219', '1.0000', '1.9531', '3.3750', '5.3594',
    ]);
  });
});

describe('integral — 사다리와 계기', () => {
  const controls = (integralFacet.blocks.controls as { controls: { action?: string; segments?: { value: number }[] }[] }).controls;
  it('사다리 = segments[].value', () => {
    const seg = (action: string) => {
      const c = controls.find((x) => x.action === action);
      if (!c?.segments) throw new Error(`손잡이 ${action} 가 없다`);
      return c.segments.map((s) => s.value);
    };
    expect(seg('rule')).toEqual(data.ruleLadder);
    expect(seg('width')).toEqual(data.widthLadder);
    expect(data.widthLadder).toHaveLength(6);
    expect(data.widthLadder[5]).toBe(0.03125);
  });

  it('width 0.25 → 1 → 0.25 에서 판 끝 계기 (8, 10) → (2, 4) → (8, 10)', async () => {
    const { rounds } = await play([
      { type: 'width', value: 1 },
      { type: 'width', value: 0.25 },
    ]);
    expect(rounds).toEqual([
      { strip: 8, evals: 10 },
      { strip: 2, evals: 4 },
      { strip: 8, evals: 10 },
    ]);
  });

  it('rule 0 → 2 → 0 에서 (8, 10) 그대로', async () => {
    const { rounds } = await play([
      { type: 'rule', value: 2 },
      { type: 'rule', value: 0 },
    ]);
    expect(rounds).toEqual([
      { strip: 8, evals: 10 },
      { strip: 8, evals: 10 },
      { strip: 8, evals: 10 },
    ]);
  });

  it('제 손잡이의 사다리 밖 값은 던진다', async () => {
    await expect(play([{ type: 'width', value: 0.3 }])).rejects.toThrow();
  });
});

describe('integral — 걸음과 phase', () => {
  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase · init → sleep → 첫 phase', async () => {
    for (const rule of data.ruleLadder) {
      const { events } = await play(rule === data.rule ? [] : [{ type: 'rule', value: rule }]);
      // 마지막 판만 본다
      const start = events.map((e) => e.type).lastIndexOf('init');
      const round = events.slice(start);
      const kinds = round.map((e) => (e.type === 'phase' ? `phase:${(e as { payload: { phase: string } }).payload.phase}` : e.type));
      expect(kinds).toEqual([
        'init',
        '__sleep',
        `phase:${RULE_PHASE[rule]}`,
        'secant',
        '__sleep',
        `phase:${AREA_PHASE[rule]}`,
        'strips',
        '__sleep',
        'phase:area-add',
        'sum',
        '__sleep',
        'compare',
      ]);
      for (const e of round) {
        if (e.type === '__sleep') continue;
        const silent = (e as FacetRuntimeEvent).silent === true;
        expect(silent).toBe(e.type === 'init' || e.type === 'phase');
      }
    }
  });

  it('첫 그림을 두 번 먹여도 요소 수가 같다 · onReset 이 무대를 비운다', async () => {
    const { events } = await play([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(integralStageView, container, { config: {}, locale: 'ko' });
    const projector = integralProjector({ stage }, { getSpeed: () => 1, t: (_k, fb) => fb });
    const real = events.filter((e): e is FacetRuntimeEvent => e.type !== '__sleep');
    const init = real[0];
    if (!init) throw new Error('init 이 없다');
    await projector.onEvent(init);
    const once = container.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    for (const e of real.slice(1)) await projector.onEvent(e);
    await projector.onEvent(init);
    const full = container.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(full);
    projector.onReset?.();
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    stage.destroy();
  });
});

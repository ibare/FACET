// @vitest-environment happy-dom
/**
 * weight-penalty — facet 고유의 주장.
 *
 * ① 모든 조합(2 × 6)에서 IR `penalize` 의 0 개수 · 끝 w 가 algorithm 과 전 정밀도로 같다
 * ② 무게 차례를 뒤집어 넣어도 같은 자리끼리 같다 ③ kind 2 에서 IR 은 −1 · TS 는 던진다
 * ④ 회차별 계기 L1 0.5 → L2 0.5 → L1 0.5 = 4 · 0 · 4 ⑤ 걸음 이벤트마다 바로 앞이 그 걸음의 phase
 * 그리고 사양 실측표 대조 · 사다리 = segments · 동률 여유 · 첫 그림 멱등.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import type { ControlSpec, FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  countZeros,
  penaltyTrace,
  weightPenaltyAlgorithm,
  weightPenaltyFacet,
  weightPenaltyImperativeIR,
  weightPenaltyStageView,
  weightText,
} from '../src/index.js';
import type { WeightPenaltyData, WeightPenaltyStage } from '../src/index.js';

const data = weightPenaltyFacet.initialData as WeightPenaltyData;
const A = data.start;
const LAMS = data.strengthLadder;

const fx = (v: number) => v.toFixed(2);

/** 사양 실측표 (갱신 10 번 뒤, 두 자리) */
const TABLE: Record<string, { l1: string; l1z: number; l2: string; l2z: number }> = {
  '0': { l1: '1.10 · -0.70 · 0.45 · -0.26 · 0.18 · -0.08', l1z: 0, l2: '1.10 · -0.70 · 0.45 · -0.26 · 0.18 · -0.08', l2z: 0 },
  '0.1': { l1: '1.00 · -0.60 · 0.35 · -0.16 · 0.08 · 0.00', l1z: 1, l2: '1.00 · -0.64 · 0.41 · -0.24 · 0.16 · -0.07', l2z: 0 },
  '0.3': { l1: '0.80 · -0.40 · 0.15 · 0.00 · 0.00 · 0.00', l1z: 3, l2: '0.85 · -0.54 · 0.35 · -0.20 · 0.14 · -0.06', l2z: 0 },
  '0.5': { l1: '0.60 · -0.20 · 0.00 · 0.00 · 0.00 · 0.00', l1z: 4, l2: '0.73 · -0.47 · 0.30 · -0.17 · 0.12 · -0.05', l2z: 0 },
  '0.8': { l1: '0.30 · 0.00 · 0.00 · 0.00 · 0.00 · 0.00', l1z: 5, l2: '0.61 · -0.39 · 0.25 · -0.14 · 0.10 · -0.04', l2z: 0 },
  '1.2': { l1: '0.00 · 0.00 · 0.00 · 0.00 · 0.00 · 0.00', l1z: 6, l2: '0.50 · -0.32 · 0.20 · -0.12 · 0.08 · -0.04', l2z: 0 },
};
const PINNED: Record<string, (number | null)[]> = {
  '0': [null, null, null, null, null, null],
  '0.1': [null, null, null, null, null, 4],
  '0.3': [null, null, null, 4, 2, 1],
  '0.5': [null, null, 5, 2, 1, 1],
  '0.8': [null, 5, 2, 1, 1, 1],
  '1.2': [5, 2, 1, 1, 1, 1],
};
const L1_ZEROS_BY_UPDATE: Record<string, number[]> = {
  '0': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  '0.1': [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
  '0.3': [0, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3],
  '0.5': [0, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4],
  '0.8': [0, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5],
  '1.2': [0, 4, 5, 5, 5, 6, 6, 6, 6, 6, 6],
};
const L2_END_RATIO = ['1.00', '0.91', '0.77', '0.67', '0.56', '0.45'];

function irRun(a: readonly number[], kind: number, lam: number): { zeros: number; w: number[] } {
  const w = a.slice();
  const zeros = runIR(weightPenaltyImperativeIR, 'penalize', [a.slice(), w, a.length, kind, lam, data.eta, data.updates]);
  if (typeof zeros !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { zeros, w };
}

function endOf(kind: number, lam: number, a: readonly number[] = A) {
  const tr = penaltyTrace(a, kind, lam, data.eta, data.updates);
  const last = tr[tr.length - 1];
  if (last === undefined) throw new Error('자취가 비었다');
  return { trace: tr, last };
}

describe('weight-penalty — 데이터와 사다리', () => {
  it('사다리가 segments[].value 와 같고 기본값이 같다', () => {
    const controls = (weightPenaltyFacet.blocks.controls as { controls: ControlSpec[] }).controls;
    const seg = (action: string) => {
      const c = controls.find((x) => x.action === action);
      if (c === undefined) throw new Error(`손잡이 ${action} 없음`);
      return c.segments as { value: number; default?: boolean }[];
    };
    expect(seg('penalty').map((s) => s.value)).toEqual(data.penaltyLadder.map((_, i) => i));
    expect(seg('strength').map((s) => s.value)).toEqual(data.strengthLadder);
    expect(seg('penalty').find((s) => s.default)?.value).toBe(data.defaultPenalty);
    expect(seg('strength').find((s) => s.default)?.value).toBe(data.defaultStrength);
    expect(data.penaltyLadder).toEqual(['L1', 'L2']);
    expect(A.length).toBe(6);
    expect(LAMS[LAMS.length - 1]).toBe(1.2);
    expect(data.updates).toBe(10);
  });
});

describe('weight-penalty — 사양 실측표', () => {
  for (const lam of LAMS) {
    it(`λ ${lam}`, () => {
      const row = TABLE[String(lam)];
      const l1 = endOf(0, lam);
      const l2 = endOf(1, lam);
      expect(l1.last.weights.map(fx).join(' · ')).toBe(row.l1);
      expect(l2.last.weights.map(fx).join(' · ')).toBe(row.l2);
      expect(countZeros(l1.last.weights)).toBe(row.l1z);
      expect(countZeros(l2.last.weights)).toBe(row.l2z);
      expect(l1.last.pinnedAt).toEqual(PINNED[String(lam)]);
      expect([0, ...l1.trace.map((u) => u.zeroCount)]).toEqual(L1_ZEROS_BY_UPDATE[String(lam)]);
      // L2 — 모든 갱신에서 같은 비율, 0 없음, 두 자리 표시로도 0.00 없음
      for (const u of l2.trace) {
        expect(u.sameRatio).toBe(true);
        expect(u.zeroCount).toBe(0);
        for (const v of u.weights) expect(fx(Math.abs(v))).not.toBe('0.00');
      }
      expect(fx(l2.last.ratios[0])).toBe(L2_END_RATIO[LAMS.indexOf(lam)]);
      // 화면의 무게 · 비 글자에 -0.00 이 뜨지 않고, 0.00 은 정확한 0 에만 뜬다
      for (const u of [...l1.trace, ...l2.trace]) {
        for (const v of u.weights) {
          expect(weightText(v)).not.toBe('-0.00');
          if (weightText(v) === '0.00') expect(v).toBe(0);
        }
        for (const v of u.ratios) expect(fx(v)).not.toBe('-0.00');
      }
    });
  }

  it('동률 여유 — |h| 와 ηλ 의 차가 모든 조합 · 모든 갱신에서 1e−9 보다 크다', () => {
    let minGap = Infinity;
    let maxAbs = 0;
    for (const lam of LAMS) {
      const el = data.eta * lam;
      for (const u of endOf(0, lam).trace) {
        if (u.h === null) throw new Error('L1 의 h 가 없다');
        for (const h of u.h) {
          minGap = Math.min(minGap, Math.abs(Math.abs(h) - el));
          maxAbs = Math.max(maxAbs, Math.abs(h));
        }
      }
    }
    expect(minGap).toBeGreaterThan(1e-9);
    expect(maxAbs).toBeLessThanOrEqual(1.1);
  });
});

describe('weight-penalty — IR ↔ algorithm', () => {
  it('① 모든 조합에서 0 개수 · 끝 w 가 전 정밀도로 같다', () => {
    for (const kind of [0, 1]) {
      for (const lam of LAMS) {
        const ir = irRun(A, kind, lam);
        const { last } = endOf(kind, lam);
        expect(ir.w).toEqual(last.weights);
        expect(ir.zeros).toBe(last.zeroCount);
      }
    }
  });

  it('② 무게 차례를 뒤집어도 같은 자리끼리 같다', () => {
    const rev = A.slice().reverse();
    for (const kind of [0, 1]) {
      for (const lam of LAMS) {
        const ir = irRun(rev, kind, lam);
        const { last } = endOf(kind, lam, rev);
        const fwd = endOf(kind, lam).last.weights;
        expect(ir.w).toEqual(last.weights);
        expect(last.weights).toEqual(fwd.slice().reverse());
        expect(ir.zeros).toBe(countZeros(fwd));
      }
    }
  });

  it('③ kind 2 — IR 은 −1, TS 는 던진다', () => {
    expect(irRun(A, 2, 0.5).zeros).toBe(-1);
    expect(() => penaltyTrace(A, 2, 0.5, data.eta, data.updates)).toThrow();
  });
});

type Round = { events: FacetRuntimeEvent[]; metric: number };

async function playRounds(inputs: { type: string; payload: { value: number } }[]): Promise<Round[]> {
  const rounds: Round[] = [{ events: [], metric: 0 }];
  let total = 0;
  let cancelled = false;
  const queue = inputs.slice();
  const ctx = {
    data: { ...data, stepMs: 0 },
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      rounds[rounds.length - 1].events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      if (name !== 'zero-weights' || typeof delta !== 'number') throw new Error(`모르는 계기 ${name}`);
      total += delta;
      rounds[rounds.length - 1].metric = total;
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: '__end' };
      }
      rounds.push({ events: [], metric: total });
      return next;
    },
  };
  await weightPenaltyAlgorithm(ctx as unknown as Parameters<typeof weightPenaltyAlgorithm>[0]);
  return rounds;
}

const phaseOf = (e: FacetRuntimeEvent | undefined): string | null => {
  if (e === undefined || e.type !== 'phase') return null;
  const p = e.payload as { phase?: unknown } | undefined;
  return typeof p?.phase === 'string' ? p.phase : null;
};

describe('weight-penalty — 회차 · phase', () => {
  it('④ L1 0.5 → L2 0.5 → L1 0.5 의 계기가 4 · 0 · 4', async () => {
    const rounds = await playRounds([
      { type: 'penalty', payload: { value: 1 } },
      { type: 'penalty', payload: { value: 0 } },
    ]);
    expect(rounds.map((r) => r.metric)).toEqual([4, 0, 4]);
  });

  it('⑤ 걸음 이벤트마다 바로 앞이 그 걸음의 phase — L1 0.5 의 열', async () => {
    const [r] = await playRounds([]);
    const steps: (string | null)[] = [];
    r.events.forEach((e, i) => {
      if (e.silent === true) return;
      steps.push(e.type === 'start' ? null : phaseOf(r.events[i - 1]));
      if (e.type !== 'start') expect(phaseOf(r.events[i - 1])).not.toBeNull();
    });
    expect(steps).toEqual([
      null,
      'l1-zero',
      'l1-zero',
      'l1-update',
      'l1-update',
      'l1-zero',
      'l1-update',
      'l1-update',
      'l1-update',
      'l1-update',
      'l1-update',
      'count',
    ]);
  });

  it('⑤ L2 로 돌리면 l2-update 열 — 한 판 12 걸음', async () => {
    const rounds = await playRounds([{ type: 'penalty', payload: { value: 1 } }]);
    const r = rounds[1];
    const steps: (string | null)[] = [];
    r.events.forEach((e, i) => {
      if (e.silent === true) return;
      steps.push(e.type === 'start' ? null : phaseOf(r.events[i - 1]));
    });
    expect(steps).toEqual([null, ...Array<string>(10).fill('l2-update'), 'count']);
  });

  it('남의 입력은 흘리고, 제 손잡이의 어긋난 값은 던진다', async () => {
    const rounds = await playRounds([
      { type: 'other', payload: { value: 1 } },
      { type: 'strength', payload: { value: 1.2 } },
    ]);
    expect(rounds.map((r) => r.metric)).toEqual([4, 4, 6]);
    expect(rounds[1].events).toHaveLength(0);
    await expect(playRounds([{ type: 'strength', payload: { value: 0.7 } }])).rejects.toThrow('사다리 밖');
    await expect(playRounds([{ type: 'penalty', payload: { value: 2 } }])).rejects.toThrow('사다리 밖');
  });
});

describe('weight-penalty — 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같다 · reset 이 결론을 걷는다', () => {
    const container = document.createElement('div');
    const inst = mountView(weightPenaltyStageView, container, { config: {}, locale: 'ko' });
    const stage = inst as unknown as WeightPenaltyStage;
    const init = { ids: data.weightIds, start: A, extent: 1.1, ratioSymbol: data.ratioSymbol };
    stage.init(init);
    const n1 = container.querySelectorAll('*').length;
    stage.init(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
    stage.start(
      {
        penalty: 'L1',
        lamText: '0.5',
        etaText: '0.40',
        etaLam: 0.2,
        etaLamText: '0.20',
        formula: data.formulas[0],
        weights: A,
        valueTexts: A.map(fx),
      },
      0,
    );
    stage.setCaption('x');
    stage.reset();
    const texts = [...container.querySelectorAll('text')].map((x) => x.textContent ?? '');
    expect(texts).not.toContain('x');
    expect(texts).not.toContain(data.formulas[0]);
    inst.destroy();
  });
});

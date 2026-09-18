// @vitest-environment happy-dom
/**
 * 사색적 디코딩 — 사양 표 대조 · IR ↔ algorithm 전 조합 대조 · 걸음 경계의 phase · 회차별 계기 ·
 * 사다리 · 화면 캡션의 수.
 */
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  makeTranslator,
  mountView,
  type FacetRuntimeEvent,
  type IR,
  type IRStmt,
  type ReactiveContext,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  matchArray,
  registerSpeculativeDecoding,
  speculateRounds,
  speculativeDecodingAlgorithm,
  speculativeDecodingFacet,
  speculativeDecodingImperativeIR,
  speculativeDecodingProjector,
  speculativeDecodingStageView,
  splitTokens,
  type SpeculativeDecodingData,
} from '../src/index.js';

const data = speculativeDecodingFacet.initialData as unknown as SpeculativeDecodingData;
const target = splitTokens(data.target);
const guess = splitTokens(data.guess);
const match = matchArray(target, guess);

/** 사양 표 — 대조용. */
const SPEC: Record<number, { checks: number; drafted: number; rejected: number; cost: number; per: number; rounds: [number, number][] }> = {
  0: { checks: 16, drafted: 0, rejected: 0, cost: 80, per: 100, rounds: Array.from({ length: 16 }, () => [0, 0] as [number, number]) },
  1: { checks: 9, drafted: 9, rejected: 2, cost: 54, per: 178, rounds: [[1, 1], [1, 0], [1, 1], [1, 0], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]] },
  2: { checks: 7, drafted: 13, rejected: 4, cost: 48, per: 229, rounds: [[2, 2], [2, 2], [2, 2], [2, 0], [2, 2], [2, 0], [1, 1]] },
  4: { checks: 5, drafted: 17, rejected: 6, cost: 42, per: 320, rounds: [[4, 2], [4, 2], [4, 3], [4, 3], [1, 1]] },
  8: { checks: 5, drafted: 30, rejected: 19, cost: 55, per: 320, rounds: [[8, 2], [8, 2], [8, 3], [5, 3], [1, 1]] },
};

type Metrics = Record<string, number>;

/** 알고리즘을 가짜 reactive 문맥으로 돌린다. 입력을 다 쓰면 취소한다. */
async function drive(inputs: number[]) {
  const metrics = new Map<string, number>();
  const runs: Metrics[] = [];
  const events: FacetRuntimeEvent[] = [];
  const boundaryPhases: string[] = [];
  const emittedPhases = new Set<string>();
  let lastPhase: string | null = null;
  let cancelled = false;
  const queue = [...inputs];
  const snapshot = (): Metrics => Object.fromEntries(metrics);

  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') {
        const ph = (e.payload as { phase: string }).phase;
        lastPhase = ph;
        emittedPhases.add(ph);
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      if (lastPhase) boundaryPhases.push(lastPhase);
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput<T extends ReactiveInputEvent>(): Promise<T> {
      if (lastPhase) boundaryPhases.push(lastPhase);
      runs.push(snapshot());
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'draft', payload: { value: v, segmentIndex: data.ladder.indexOf(v) } } as unknown as T;
    },
  } as unknown as ReactiveContext<SpeculativeDecodingData>;

  await speculativeDecodingAlgorithm(ctx);
  return { runs, events, boundaryPhases, emittedPhases };
}

function irPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]) => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      }
      if (s.kind === 'while' || s.kind === 'for-range') walk(s.body);
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

describe('speculative-decoding — 셈', () => {
  it('데이터: 16 토큰, 틀린 자리 넷 (3 · 6 · 10 · 14 번째)', () => {
    expect(target.length).toBe(16);
    expect(guess.length).toBe(16);
    const wrong = match.map((m, i) => (m === 0 ? i + 1 : 0)).filter((x) => x > 0);
    expect(wrong).toEqual([3, 6, 10, 14]);
  });

  it('γ 마다 사양 표와 같다', () => {
    for (const g of data.ladder) {
      const run = speculateRounds(match, g, data.draftCost, data.checkCost);
      const spec = SPEC[g];
      expect({
        checks: run.checks,
        drafted: run.drafted,
        rejected: run.rejected,
        cost: run.cost,
        per: run.perCheckX100,
        rounds: run.rounds.map((r) => [r.k, r.accepted]),
      }).toEqual(spec);
    }
  });

  it('IR 이 모든 γ 에서 알고리즘과 같은 답을 낸다', () => {
    for (const g of data.ladder) {
      const run = speculateRounds(match, g, data.draftCost, data.checkCost);
      const tally = [0, 0];
      const checks = runIR(speculativeDecodingImperativeIR, 'speculate', [[...match], g, tally]);
      const cost = runIR(speculativeDecodingImperativeIR, 'costOf', [tally[0], checks as number, data.draftCost, data.checkCost]);
      expect({ checks, drafted: tally[0], rejected: tally[1], cost }).toEqual({
        checks: run.checks,
        drafted: run.drafted,
        rejected: run.rejected,
        cost: run.cost,
      });
    }
  });

  it('32 비트 잠금 — 길이 16, 사다리 끝 8, 정수 중간값 ≤ 80', () => {
    expect(match.length).toBe(16);
    expect(Math.max(...data.ladder)).toBe(8);
    const peak = Math.max(
      ...data.ladder.map((g) => {
        const r = speculateRounds(match, g, data.draftCost, data.checkCost);
        return Math.max(r.cost, r.drafted, r.checks, 16 * 100 + r.checks);
      }),
    );
    expect(peak).toBeLessThan(2 ** 31 - 1);
    expect(Math.max(...data.ladder.map((g) => speculateRounds(match, g, 1, 5).cost))).toBe(80);
  });
});

describe('speculative-decoding — 알고리즘', () => {
  it('회차별 계기가 사양 표와 같다 (0 → 4 → 8 → 4 → 1 → 2 → 0)', async () => {
    const seq = [4, 8, 4, 1, 2, 0];
    const { runs } = await drive(seq);
    const order = [0, ...seq];
    expect(runs.length).toBe(order.length);
    runs.forEach((m, i) => {
      const s = SPEC[order[i]];
      expect(m).toEqual({ 'check-count': s.checks, 'rejected-count': s.rejected, 'cost-sum': s.cost });
    });
  });

  it('처음 판(γ = 0)에서도 계기 이름 셋이 실린다', async () => {
    const { runs } = await drive([]);
    expect(Object.keys(runs[0]).sort()).toEqual(['check-count', 'cost-sum', 'rejected-count']);
  });

  it('사다리 밖 값과 남의 입력은 흘린다', async () => {
    const metrics = new Map<string, number>();
    let cancelled = false;
    const inputs: ReactiveInputEvent[] = [
      { type: 'speed', payload: 2 },
      { type: 'draft', payload: { value: 3 } },
      { type: 'draft', payload: { value: '4' } },
      { type: 'draft', payload: { value: 4 } },
    ];
    const gammas: number[] = [];
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        if (e.type === 'run-start') gammas.push((e.payload as { gamma: number }).gamma);
      },
      metric(name: string, delta: number) {
        metrics.set(name, (metrics.get(name) ?? 0) + delta);
      },
      async sleep() {
        return true;
      },
      async waitForInput() {
        const x = inputs.shift();
        if (!x) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return x;
      },
    } as unknown as ReactiveContext<SpeculativeDecodingData>;
    await speculativeDecodingAlgorithm(ctx);
    expect(gammas).toEqual([0, 4]);
  });

  it('phase 집합 — algorithm = IR = 걸음 경계마다 켜진 것', async () => {
    const { boundaryPhases, emittedPhases } = await drive([1, 2, 4, 8]);
    const ir = irPhases(speculativeDecodingImperativeIR);
    expect([...emittedPhases].sort()).toEqual([...ir].sort());
    expect([...new Set(boundaryPhases)].sort()).toEqual([...ir].sort());
  });

  it('mechanismKind 가 reactive 다', () => {
    clearRegistry();
    registerSpeculativeDecoding();
    expect(getAlgorithmMechanismKind('speculativeDecoding')).toBe('reactive');
  });

  it('사다리가 손잡이 구간 값과 같고 기본값이 처음 γ 다', () => {
    const controls = (speculativeDecodingFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider') as {
      action: string;
      segments: Array<{ value: number; default?: boolean }>;
    };
    expect(knob.action).toBe('draft');
    expect(knob.segments.map((s) => s.value)).toEqual(data.ladder);
    expect(knob.segments.find((s) => s.default)?.value).toBe(data.draft);
  });
});

describe('speculative-decoding — 화면', () => {
  async function play(inputs: number[], locale = 'en') {
    const { events } = await drive(inputs);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator(locale, speculativeDecodingFacet.messages);
    const stage = mountView(speculativeDecodingStageView, container, {
      config: { type: 'speculative-decoding-stage' },
      initialData: structuredClone(data) as unknown as Record<string, unknown>,
      locale,
      t,
    });
    const svg = container.querySelector('svg') as SVGSVGElement;
    const viewBox = svg.getAttribute('viewBox');
    const lit: string[] = [];
    const projector = speculativeDecodingProjector(
      {
        stage,
        codePanel: { highlightPhase: (p: string | null) => lit.push(String(p)), clearHighlight: () => undefined, destroy: () => undefined },
      },
      { getSpeed: () => 1, t },
    );
    projector.onInit?.(structuredClone(data));
    const texts: string[] = [];
    for (const e of events) {
      await projector.onEvent(e);
      if (e.type === 'run-end') texts.push(Array.from(svg.querySelectorAll('text')).map((x) => x.textContent).join(' | '));
    }
    return { svg, viewBox, texts, lit, stage, container };
  }

  it('끝 캡션의 수가 계기 값과 같다 (회차마다)', async () => {
    const seq = [4, 8, 1];
    const { texts } = await play(seq);
    const order = [0, ...seq];
    texts.forEach((txt, i) => {
      const s = SPEC[order[i]];
      expect(txt).toContain(`γ = ${order[i]}: ${s.checks} big-model checks, ${s.rejected} drafted words thrown away, cost ${s.cost}.`);
    });
    // 장부 — 지나간 γ 의 비용이 남아 있다
    const last = texts[texts.length - 1];
    for (const g of order) expect(last).toContain(String(SPEC[g].cost));
  });

  it('자리 표시자가 날것으로 뜨지 않고, 세로가 바뀌지 않으며, 코드 패널이 phase 를 받는다', async () => {
    const { svg, viewBox, texts, lit, stage } = await play([2], 'ko');
    for (const txt of texts) expect(txt).not.toMatch(/\{[a-z]+\}/);
    expect(texts[1]).toContain('비용 48');
    expect(svg.getAttribute('viewBox')).toBe(viewBox);
    expect(new Set(lit)).toEqual(new Set(['start', 'draft', 'verify', 'cost']));
    (stage as { destroy(): void }).destroy();
  });

  it('검사당 낱말 소수는 locale 표기를 따른다 (fr 은 쉼표)', async () => {
    const { texts } = await play([4], 'fr');
    expect(texts[1]).toContain('3,20');
    expect(texts[1]).not.toMatch(/example ratio|\{[a-z]+\}/);
  });

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    expect(() => mountView(speculativeDecodingStageView, container, { config: {} })).not.toThrow();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

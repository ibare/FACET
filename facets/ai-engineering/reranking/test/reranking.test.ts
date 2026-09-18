// @vitest-environment happy-dom
/**
 * reranking — 사양 표 대조 · IR ↔ algorithm 전 조합 · 걸음 경계마다 켜진 phase · 회차별 계기.
 */
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  makeTranslator,
  mountView,
  type FacetRuntimeEvent,
  type IRStmt,
  type ReactiveContext,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';

import {
  firstStageOrder,
  movedCount,
  registerReranking,
  rerankOrder,
  rerankingAlgorithm,
  rerankingFacet,
  rerankingImperativeIR,
  rerankingProjector,
  rerankingStageView,
  type RerankingData,
} from '../src/index.js';

const data = rerankingFacet.initialData as unknown as RerankingData;

/** 사양 표 — 대조용 */
const SPEC: Record<number, { top5: number[]; hits: number; moved: number; calls: number }> = {
  3: { top5: [1, 3, 2, 4, 5], hits: 1, moved: 2, calls: 3 },
  6: { top5: [1, 5, 4, 3, 6], hits: 2, moved: 5, calls: 6 },
  9: { top5: [1, 5, 7, 9, 4], hits: 3, moved: 8, calls: 9 },
  12: { top5: [1, 5, 7, 9, 11], hits: 3, moved: 11, calls: 12 },
};

const crossOf = (doc: number): number => data.docs.find((d) => d.id === doc)?.cross ?? -1;

type Round = {
  n: number;
  metrics: Record<string, number>;
  order: number[];
  hits: number;
  scored: number[];
  lit: string[];
  left: number[];
};

/** 문턱 아래 남은 정답 — 셈한 값 */
const LEFT: Record<number, number[]> = { 3: [5, 7, 9, 11], 6: [7, 9, 11], 9: [11], 12: [] };

/** 가짜 reactive 문맥으로 알고리즘을 끝까지 굴린다. inputs 는 판 사이마다 하나씩 준다. */
async function drive(inputs: unknown[]): Promise<{ rounds: Round[]; events: FacetRuntimeEvent[] }> {
  const metrics: Record<string, number> = {};
  const events: FacetRuntimeEvent[] = [];
  const rounds: Round[] = [];
  let cancelled = false;
  let lastPhase: string | null = null;
  let lit = new Set<string>();
  let cur: Partial<Round> & { scored: number[] } = { scored: [] };
  const queue = [...inputs];
  const d = structuredClone(data);
  const ctx = {
    data: d,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      const p = e.payload as Record<string, unknown>;
      if (e.type === 'phase') lastPhase = p.phase as string;
      if (e.type === 'shortlist') cur = { n: p.n as number, scored: [] };
      if (e.type === 'score') cur.scored.push(p.doc as number);
      if (e.type === 'answer') {
        cur.order = p.order as number[];
        cur.hits = p.hits as number;
        cur.left = p.leftRelevant as number[];
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      if (lastPhase) lit.add(lastPhase);
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ ...(cur as Round), metrics: { ...metrics }, lit: [...lit].sort() });
      lit = new Set();
      if (queue.length === 0) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return queue.shift() as { type: string; payload?: unknown };
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<RerankingData>;
  await rerankingAlgorithm(ctx);
  return { rounds, events };
}

const slide = (value: number) => ({ type: 'shortlist', payload: { value, segmentIndex: [3, 6, 9, 12].indexOf(value) } });

function irPhases(stmts: IRStmt[], out = new Set<string>()): Set<string> {
  for (const s of stmts) {
    if ('phase' in s && s.phase) out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    }
    if (s.kind === 'for-range' || s.kind === 'while') irPhases(s.body, out);
  }
  return out;
}
const IR_PHASES = [...irPhases(rerankingImperativeIR.functions[0].body)].sort();

describe('reranking — 데이터', () => {
  it('사다리가 손잡이 구간 값과 같다', () => {
    const controls = (rerankingFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const slider = controls.find((c) => c.widget === 'segmented-slider') as { segments: Array<{ value: number }> };
    expect(slider.segments.map((s) => s.value)).toEqual(data.shortlists);
    expect(data.shortlists).toEqual([3, 6, 9, 12]);
  });

  it('32 비트 잠금 — 문서 열둘, 사다리 끝 12, 점수는 0~100 정수', () => {
    expect(data.docs).toHaveLength(12);
    expect(Math.max(...data.shortlists)).toBe(12);
    for (const d of data.docs) {
      for (const s of [d.first, d.cross]) {
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
  });

  it('두 점수 모두 동률 0 건', () => {
    const ties = (xs: number[]) => xs.length - new Set(xs).size;
    expect(ties(data.docs.map((d) => d.first))).toBe(0);
    expect(ties(data.docs.map((d) => d.cross))).toBe(0);
  });

  it('첫 단계 차례는 1..12', () => {
    expect(firstStageOrder(data.docs)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('동률 규칙 — 같으면 번호가 작은 쪽이 앞선다', () => {
    const score = new Map([[4, 50], [2, 50], [9, 70]]);
    expect(rerankOrder([4, 2, 9], (d) => score.get(d) ?? 0, 3)).toEqual([9, 2, 4]);
  });
});

describe('reranking — 사양 표 · IR 대조', () => {
  for (const n of [3, 6, 9, 12]) {
    it(`n = ${n}: 셈한 값이 사양 표와 같고, IR 이 같은 답을 낸다`, () => {
      const first = firstStageOrder(data.docs);
      const order = rerankOrder(first, crossOf, n);
      const top = order.slice(0, 3);
      const hits = top.filter((d) => data.docs.find((x) => x.id === d)?.relevant).length;
      expect(order.slice(0, 5)).toEqual(SPEC[n].top5);
      expect(hits).toBe(SPEC[n].hits);
      expect(movedCount(first, order)).toBe(SPEC[n].moved);

      const cross = data.docs.map((d) => d.cross);
      const relevant = data.docs.map((d) => (d.relevant ? 1 : 0));
      const irOrder = [...first];
      const irHits = runIR(rerankingImperativeIR, 'rerankTop', [cross, relevant, irOrder, n]);
      expect(irHits).toBe(hits);
      expect(irOrder).toEqual(order);
    });
  }
});

describe('reranking — 알고리즘', () => {
  it('등록하면 reactive', () => {
    clearRegistry();
    registerReranking();
    expect(getAlgorithmMechanismKind('reranking')).toBe('reactive');
  });

  it('회차별 계기 — 3 → 6 → 3 → 9 → 12 → 9 → 12 → 6', async () => {
    const seq = [6, 3, 9, 12, 9, 12, 6];
    const { rounds } = await drive(seq.map(slide));
    const ns = [3, ...seq];
    expect(rounds.map((r) => r.n)).toEqual(ns);
    rounds.forEach((r, i) => {
      const s = SPEC[ns[i]];
      expect(r.metrics).toEqual({
        'rerank-count': s.calls,
        'relevant-top-count': s.hits,
        'moved-count': s.moved,
      });
      expect(r.order.slice(0, 5)).toEqual(s.top5);
      expect(r.hits).toBe(s.hits);
      // 재순위기는 넘겨받은 것만 읽는다
      expect(r.scored).toEqual(firstStageOrder(data.docs).slice(0, ns[i]));
      expect(r.left).toEqual(LEFT[ns[i]]);
    });
  });

  it('우리 것이 아닌 입력 · 사다리 밖 값은 흘린다', async () => {
    const { rounds } = await drive([{ type: 'play' }, slide(5), { type: 'shortlist', payload: { value: '6' } }, slide(6)]);
    // 흘린 입력은 판을 열지 않는다 — waitForInput 이 판 끝마다 한 번 기록하고 흘릴 때도 기록한다
    expect(rounds.map((r) => r.n)).toEqual([3, 3, 3, 3, 6]);
    expect(rounds[4].metrics['rerank-count']).toBe(6);
  });

  it('phase 집합 = IR phase 집합, 걸음 경계마다 켜진 phase 도 같다', async () => {
    const { rounds, events } = await drive([slide(12)]);
    const emitted = [
      ...new Set(
        events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
      ),
    ].sort();
    expect(IR_PHASES).toEqual(['count', 'score', 'shortlist', 'swap']);
    expect(emitted).toEqual(IR_PHASES);
    for (const r of rounds) expect(r.lit).toEqual(IR_PHASES);
    for (const e of events) if (e.type === 'phase') expect(e.silent).toBe(true);
  });
});

describe('reranking — projector 캡션', () => {
  type Call = { m: string; args: unknown[] };
  function harness() {
    const calls: Call[] = [];
    const stage = new Proxy(
      {},
      { get: (_t, key) => (key === 'then' ? undefined : (...args: unknown[]) => calls.push({ m: String(key), args })) },
    );
    const phases: Array<string | null> = [];
    const codePanel = { highlightPhase: (p: string | null) => phases.push(p), destroy() {} };
    const p = rerankingProjector({ stage: stage as never, codePanel }, { getSpeed: () => 1, t: makeTranslator('en') });
    p.onInit?.(structuredClone(data));
    return { p, calls, phases };
  }

  it('위 셋 정답 수 · 문턱 아래 남은 정답이 셈한 값과 같다', async () => {
    const expectLeft: Record<number, string> = {
      3: 'Relevant documents left below the line: 5, 7, 9, 11. The reranker never saw them.',
      6: 'Relevant documents left below the line: 7, 9, 11. The reranker never saw them.',
      9: 'Relevant documents left below the line: 11. The reranker never saw them.',
      12: 'No relevant document is left below the line.',
    };
    const { events } = await drive([slide(6), slide(9), slide(12)]);
    const { p, calls, phases } = harness();
    for (const e of events) await p.onEvent(e);
    const answers = calls.filter((c) => c.m === 'setCaption' && String(c.args[0]).startsWith('Relevant in the top 3'));
    expect(answers.map((c) => c.args)).toEqual(
      [3, 6, 9, 12].map((n) => [
        `Relevant in the top 3: ${SPEC[n].hits} of 3. Reranker calls: ${n}.`,
        expectLeft[n],
      ]),
    );
    const reorders = calls.filter((c) => c.m === 'setCaption' && String(c.args[0]).startsWith('Only the'));
    expect(reorders.map((c) => c.args[0])).toEqual(
      [3, 6, 9, 12].map((n) => `Only the ${n} passed over change places, by reranker score. Documents moved: ${SPEC[n].moved}.`),
    );
    expect(phases.filter((x) => x !== null).length).toBeGreaterThan(0);
  });
});

describe('reranking — stage', () => {
  it('mountView 로 띄우고 걸음을 밟아도 던지지 않으며 세로가 그대로다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(rerankingStageView, container, {
      config: { type: 'reranking-stage' },
      initialData: structuredClone(data) as unknown as Record<string, unknown>,
      t: makeTranslator('ko', rerankingFacet.messages),
      locale: 'ko',
    }) as unknown as Record<string, (...a: unknown[]) => void>;
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const vb = svg?.getAttribute('viewBox');
    inst.setRound(12, firstStageOrder(data.docs), 0);
    for (const d of firstStageOrder(data.docs)) inst.readDoc(d, crossOf(d), 0);
    inst.reorder(rerankOrder(firstStageOrder(data.docs), crossOf, 12), 0);
    inst.showTop([1, 5, 7], 0);
    inst.setCaption('a', 'b');
    expect(container.querySelector('svg')).toBe(svg);
    expect(svg?.getAttribute('viewBox')).toBe(vb);
    expect(svg?.textContent).toContain('Freeze sliced bread');
    // 첫 단계 점수는 늘 보이고, 재순위 점수는 읽은 것만
    inst.setRound(3, firstStageOrder(data.docs), 0);
    expect(svg?.textContent).not.toContain('84');
    inst.destroy();
  });

  it('initialData 없이도 마운트에서 던지지 않는다', () => {
    const container = document.createElement('div');
    const inst = mountView(rerankingStageView, container, { config: {} });
    expect(() => inst.destroy()).not.toThrow();
  });
});

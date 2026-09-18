// @vitest-environment happy-dom
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
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computeBase,
  fuse,
  hybridSearchAlgorithm,
  hybridSearchFacet,
  hybridSearchImperativeIR,
  hybridSearchProjector,
  hybridSearchStageView,
  registerHybridSearch,
  type HybridSearchData,
} from '../src/index.js';

const data = hybridSearchFacet.initialData as unknown as HybridSearchData;
const clone = (): HybridSearchData => JSON.parse(JSON.stringify(data)) as HybridSearchData;
const name = (i: number): string => `d${i + 1}`;

/** 사양의 표 — 대조용. */
const SPEC: Record<number, { order: string; relevant: number; none: number }> = {
  0: { order: 'd2 d5 d7 d8 d1 d4 d3 d6', relevant: 2, none: 3 },
  1: { order: 'd2 d5 d1 d7 d8 d4 d3 d6', relevant: 3, none: 2 },
  2: { order: 'd1 d2 d5 d4 d6 d7 d3 d8', relevant: 3, none: 2 },
  3: { order: 'd1 d6 d4 d2 d3 d5 d7 d8', relevant: 1, none: 0 },
  4: { order: 'd1 d6 d4 d3 d2 d5 d7 d8', relevant: 1, none: 0 },
};

type Drive = {
  events: FacetRuntimeEvent[];
  /** 판마다 settle 시점의 계기 값. */
  runs: Record<string, number>[];
  /** 판마다 계기에 실린 이름. */
  namesPerRun: Set<string>[];
  /** 걸음 경계(sleep · waitForInput)마다 켜져 있던 phase. */
  lit: Set<string>;
  emitted: Set<string>;
};

/** 가짜 reactive 문맥으로 알고리즘을 끝까지 몬다. 입력이 다하면 취소한다. */
async function drive(inputs: { type: string; payload?: unknown }[]): Promise<Drive> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const runs: Record<string, number>[] = [];
  const namesPerRun: Set<string>[] = [new Set()];
  const lit = new Set<string>();
  const emitted = new Set<string>();
  let lastPhase: string | null = null;
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: clone(),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') {
        const p = (e.payload as { phase: string }).phase;
        lastPhase = p;
        emitted.add(p);
      }
      if (e.type === 'settle') {
        runs.push(Object.fromEntries(metrics));
        namesPerRun.push(new Set());
      }
    },
    metric(n: string, d: number | 'inc') {
      metrics.set(n, (metrics.get(n) ?? 0) + (d === 'inc' ? 1 : d));
      namesPerRun[namesPerRun.length - 1]!.add(n);
    },
    async sleep() {
      if (lastPhase) lit.add(lastPhase);
      return !cancelled;
    },
    async waitForInput() {
      if (lastPhase) lit.add(lastPhase);
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<HybridSearchData>;
  await hybridSearchAlgorithm(ctx);
  namesPerRun.pop();
  return { events, runs, namesPerRun, lit, emitted };
}

const knob = (value: number) => ({ type: 'lexical', payload: { value, segmentIndex: value } });

function irPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      }
      if (s.kind === 'for-range' || s.kind === 'while') walk(s.body);
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

describe('hybrid-search 셈', () => {
  const base = computeBase(clone());

  it('토큰 · BM25 · 두 등수가 사양의 대조값과 같다', () => {
    expect(base.queryTokens).toEqual(['update', 'fails', 'error', '0x80070005']);
    expect(base.tokenCounts).toEqual([9, 13, 7, 9, 10, 10, 6, 7]);
    expect(base.avgdl).toBe(8.875);
    expect(base.lexScores.map((s) => s.toFixed(4))).toEqual([
      '3.1517', '0.0000', '1.0338', '1.8781', '0.0000', '2.1157', '0.0000', '0.0000',
    ]);
    expect(base.lexRank).toEqual([1, 5, 4, 3, 6, 2, 7, 8]);
    expect(base.vecRank).toEqual([5, 1, 7, 6, 2, 8, 3, 4]);
    // 등수 동률(번호 오름차순)이 실제로 걸린다 — BM25 0 점 넷.
    expect(base.noShared.map((z, i) => (z ? name(i) : '')).filter(Boolean)).toEqual(['d2', 'd5', 'd7', 'd8']);
  });

  it('몫마다 합친 차례와 위 3 이 사양 표와 같다', () => {
    for (const w of data.ladder) {
      const f = fuse(base, w, data);
      expect(f.order.map(name).join(' '), `w=${w}`).toBe(SPEC[w]!.order);
      expect(f.relevantTop).toBe(SPEC[w]!.relevant);
      expect(f.noSharedTop).toBe(SPEC[w]!.none);
    }
  });

  it('섞은 점수의 동률은 50 % 의 d1 · d2 한 쌍뿐이다', () => {
    const ties = data.ladder.flatMap((w) => fuse(base, w, data).ties.map(([a, b]) => `${w}:${name(a)}=${name(b)}`));
    expect(ties).toEqual(['2:d1=d2']);
  });
});

describe('hybrid-search IR', () => {
  const base = computeBase(clone());
  const lex = base.lexRank;
  const vec = base.vecRank;
  const rel = base.relevant.map((r) => (r ? 1 : 0));

  it('모든 몫에서 fuseTop 의 답이 알고리즘의 relevant-top-count 와 같다', async () => {
    const d = await drive([knob(1), knob(2), knob(3), knob(4)]);
    expect(d.runs.map((r) => r['relevant-top-count'])).toEqual([0, 1, 2, 3, 4].map((w) => SPEC[w]!.relevant));
    for (const w of data.ladder) {
      const taken = new Array<number>(8).fill(0);
      const hits = runIR(hybridSearchImperativeIR, 'fuseTop', [lex, vec, rel, w, data.top, taken]);
      expect(hits, `w=${w}`).toBe(d.runs[w]!['relevant-top-count']);
      // IR 이 고른 전체 차례(taken 의 1 부터 자리)가 화면이 seat 로 세운 차례와 같다.
      const irOrder = taken.map((place, doc) => ({ place, doc })).sort((a, b) => a.place - b.place);
      expect(irOrder.map((x) => x.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      const seats = d.events
        .filter((e) => e.type === 'seat')
        .slice(w * 8, w * 8 + 8)
        .map((e) => (e.payload as { doc: number }).doc);
      expect(irOrder.map((x) => x.doc), `w=${w}`).toEqual(seats);
    }
  });

  it('32비트 — 배열 길이 · 사다리 끝 · 등수 상한을 잠그고, 견주는 곱의 상한이 int32 안이다', () => {
    expect(lex.length).toBe(8);
    expect(vec.length).toBe(8);
    expect(Math.max(...data.ladder)).toBe(data.parts);
    expect(data.parts).toBe(4);
    expect(data.rrfK).toBe(60);
    const K = data.rrfK;
    const bound = data.parts * (K + 8) * ((K + 8) * (K + 8));
    expect(bound).toBe(1_257_728);
    expect(bound).toBeLessThan(2 ** 31);
    // IR 의 훑기를 그대로 따라 실제 곱의 최대를 잰다.
    let seen = 0;
    for (const w of data.ladder) {
      const taken = new Array<number>(8).fill(0);
      for (let k = 0; k < 8; k += 1) {
        let best = -1;
        for (let i = 0; i < 8; i += 1) {
          if (taken[i] !== 0) continue;
          if (best === -1) {
            best = i;
            continue;
          }
          const num = w * (K + vec[i]!) + (4 - w) * (K + lex[i]!);
          const den = (K + lex[i]!) * (K + vec[i]!);
          const bn = w * (K + vec[best]!) + (4 - w) * (K + lex[best]!);
          const bd = (K + lex[best]!) * (K + vec[best]!);
          seen = Math.max(seen, num * bd, bn * den);
          if (num * bd > bn * den) best = i;
        }
        taken[best] = 1;
      }
    }
    expect(seen).toBeLessThanOrEqual(bound);
    expect(seen).toBe(1_183_744);
  });
});

describe('hybrid-search 알고리즘', () => {
  it('phase 집합 — 발신 · 걸음 경계마다 켜진 것 · IR 이 모두 같다', async () => {
    const d = await drive([knob(1), knob(2), knob(3), knob(4)]);
    const ir = irPhases(hybridSearchImperativeIR);
    expect([...ir].sort()).toEqual(['count', 'done', 'seat', 'weigh']);
    expect([...d.emitted].sort()).toEqual([...ir].sort());
    expect([...d.lit].sort()).toEqual([...ir].sort());
  });

  it('회차별 계기 — A → B → A 로 돌려도 판마다 사양 표와 같다 (쌓이지 않는다)', async () => {
    const seq = [0, 3, 0, 1, 1, 4, 2];
    const d = await drive(seq.slice(1).map(knob));
    expect(d.runs).toHaveLength(seq.length);
    d.runs.forEach((r, k) => {
      const w = seq[k]!;
      expect(r['relevant-top-count'], `run ${k} w=${w}`).toBe(SPEC[w]!.relevant);
      expect(r['no-shared-word-count'], `run ${k} w=${w}`).toBe(SPEC[w]!.none);
    });
    // 판마다 두 계기 이름이 실린다. 판 머리에서 계기를 0 으로 되돌리는 gauge 호출이 판마다
    // 한 번씩 이름을 싣기 때문이다 — 값이 안 갈리는 1 → 1 에서도 그 덕에 실린다.
    for (const names of d.namesPerRun) {
      expect([...names].sort()).toEqual(['no-shared-word-count', 'relevant-top-count']);
    }
  });

  it('우리 것이 아닌 입력과 사다리 밖의 값은 흘린다', async () => {
    const d = await drive([
      { type: 'advance' },
      { type: 'lexical', payload: { value: 7 } },
      { type: 'lexical', payload: { value: '2' } },
      knob(3),
    ]);
    expect(d.runs.map((r) => r['relevant-top-count'])).toEqual([2, 1]);
  });

  it('seat 는 한 판에 여덟, 자리는 0..7 차례', async () => {
    const d = await drive([]);
    const seats = d.events.filter((e) => e.type === 'seat').map((e) => (e.payload as { place: number }).place);
    expect(seats).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('hybrid-search 선언', () => {
  it('mechanismKind 가 reactive 로 등록된다', () => {
    clearRegistry();
    registerHybridSearch();
    expect(getAlgorithmMechanismKind('hybridSearch')).toBe('reactive');
  });

  it('사다리가 손잡이의 segments[].value 와 같고 기본값이 처음 몫이다', () => {
    const controls = (hybridSearchFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
    const knobSpec = controls.find((c) => c.widget === 'segmented-slider') as {
      action: string;
      segments: { value: number; label: unknown; default?: boolean }[];
    };
    expect(knobSpec.action).toBe('lexical');
    expect(knobSpec.segments.map((s) => s.value)).toEqual(data.ladder);
    expect(knobSpec.segments.find((s) => s.default)?.value).toBe(data.weight);
    expect(knobSpec.segments.map((s) => s.label)).toEqual(['0%', '25%', '50%', '75%', '100%']);
  });
});

describe('hybrid-search 화면', () => {
  function mount(locale: string) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(hybridSearchStageView, container, {
      config: { type: 'hybrid-search-stage' },
      initialData: hybridSearchFacet.initialData,
      locale,
      t: makeTranslator(locale, hybridSearchFacet.messages),
    });
    const phases: (string | null)[] = [];
    const codePanel = { destroy() {}, highlightPhase: (p: string | null) => phases.push(p) };
    const projector = hybridSearchProjector(
      { stage, codePanel },
      { getSpeed: () => 1000, t: makeTranslator(locale, hybridSearchFacet.messages) },
    );
    projector.onInit?.(clone());
    return { container, stage, projector, phases };
  }

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('initialData 없이 마운트해도 던지지 않고 캔버스를 떼지 않는다', () => {
    const container = document.createElement('div');
    const inst = mountView(hybridSearchStageView, container, { config: {} });
    expect(container.querySelector('svg')).not.toBeNull();
    inst.destroy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('판마다 캡션의 수와 합친 줄의 차례가 사양 표와 같다', async () => {
    const seq = [0, 3, 1];
    const d = await drive(seq.slice(1).map(knob));
    const { container, projector, phases } = mount('ko');
    const svg = container.querySelector('svg')!;
    let run = 0;
    for (const e of d.events) {
      await projector.onEvent(e);
      if (e.type !== 'settle') continue;
      await delay(40);
      const w = seq[run]!;
      const captions = [...svg.querySelectorAll('text')].map((n) => n.textContent ?? '');
      expect(captions).toContain(
        `위 3 가운데 정답: ${SPEC[w]!.relevant}. 그 3 가운데 질의와 낱말이 하나도 안 겹친 문서: ${SPEC[w]!.none}.`,
      );
      // 칸의 세로 자리 차례 = 합친 차례.
      const chips = [...svg.querySelectorAll('g > g')].filter((g) => g.getAttribute('transform')?.startsWith('translate('));
      const ys = chips.map((g, i) => ({ i, y: Number(/translate\([\d.]+ ([\d.-]+)\)/.exec(g.getAttribute('transform')!)![1]) }));
      const ids = ys.map(({ i, y }) => ({ id: chips[i]!.querySelector('text')!.textContent, y })).sort((a, b) => a.y - b.y);
      expect(ids.map((x) => x.id).join(' '), `w=${w}`).toBe(SPEC[w]!.order);
      run += 1;
    }
    expect(run).toBe(seq.length);
    expect(phases).toContain('weigh');
    // 질의는 자료라 원문 그대로 뜬다.
    expect([...svg.querySelectorAll('text')].some((n) => n.textContent === data.query)).toBe(true);
  });

  it('seat 캡션은 자리를 1 부터 읽고 문서 글을 원문 그대로 보인다', async () => {
    const d = await drive([]);
    const { container, projector } = mount('en');
    const svg = container.querySelector('svg')!;
    for (const e of d.events) {
      await projector.onEvent(e);
      if (e.type === 'seat' && (e.payload as { place: number }).place === 0) break;
    }
    const texts = [...svg.querySelectorAll('text')].map((n) => n.textContent ?? '');
    expect(texts).toContain('Place 1: d2');
    expect(texts.some((t) => t.startsWith('If Windows cannot install new patches'))).toBe(true);
  });
});

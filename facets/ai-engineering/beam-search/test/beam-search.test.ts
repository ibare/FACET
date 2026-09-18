// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  mountView,
  type FacetContext,
  type FacetRuntimeEvent,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  BEAM_ROW_SLOTS,
  beamSearchAlgorithm,
  beamSearchFacet,
  beamSearchImperativeIR,
  beamSearchProjector,
  beamSearchStageView,
  encodeBeamTables,
  formatScore,
  registerBeamSearch,
  runBeamSearch,
  toPermille,
  type BeamSearchData,
} from '../src/index.js';

const DATA = beamSearchFacet.initialData as unknown as BeamSearchData;
const clone = (): BeamSearchData => JSON.parse(JSON.stringify(DATA)) as BeamSearchData;

/** 사양 표 — 대조용. */
const TABLE: {
  erase: number;
  width: number;
  text: string;
  score: number;
  correct: boolean;
  rank: number;
  scored: number;
  erased: number;
}[] = [
  { erase: 0, width: 1, text: 'a apple pie', score: 141_750, correct: false, rank: 0, scored: 8, erased: 0 },
  { erase: 0, width: 2, text: 'a apple pie', score: 141_750, correct: false, rank: 0, scored: 13, erased: 0 },
  { erase: 0, width: 3, text: 'some soup .', score: 150_000, correct: true, rank: 1, scored: 16, erased: 0 },
  { erase: 0, width: 4, text: 'some soup .', score: 150_000, correct: true, rank: 1, scored: 18, erased: 0 },
  { erase: 1, width: 1, text: 'a big sandwich', score: 74_250, correct: true, rank: 5, scored: 7, erased: 1 },
  { erase: 1, width: 2, text: 'an apple .', score: 127_500, correct: true, rank: 2, scored: 11, erased: 2 },
  { erase: 1, width: 3, text: 'some soup .', score: 150_000, correct: true, rank: 1, scored: 14, erased: 2 },
  { erase: 1, width: 4, text: 'some soup .', score: 150_000, correct: true, rank: 1, scored: 16, erased: 2 },
];

const rowOf = (erase: number, width: number) => TABLE.find((r) => r.erase === erase && r.width === width)!;

const segmentsOf = (action: string): { value: number; default?: boolean }[] => {
  const controls = (beamSearchFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
  const c = controls.find((x) => x.action === action)!;
  return c.segments as { value: number; default?: boolean }[];
};

/** reactive ctx 흉내 — 걸음 경계(sleep · waitForInput)마다 켜진 phase 를 모은다. */
function fakeCtx(inputs: ReactiveInputEvent[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const metricNames = new Set<string>();
  const litAtBoundary = new Set<string>();
  const rounds: Record<string, number>[] = [];
  let lastPhase: string | null = null;
  let cancelled = false;
  const snapshot = () => rounds.push(Object.fromEntries(metrics));
  const ctx = {
    data: clone(),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') {
        const p = (e.payload as { phase?: unknown }).phase;
        if (typeof p === 'string') lastPhase = p;
      }
    },
    metric(name: string, delta: number | 'inc') {
      metricNames.add(name);
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      if (lastPhase) litAtBoundary.add(lastPhase);
      return !cancelled;
    },
    async waitForInput() {
      if (lastPhase) litAtBoundary.add(lastPhase);
      snapshot();
      const next = inputs.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  return { ctx, events, metrics, metricNames, litAtBoundary, rounds };
}

const knob = (type: string, value: number): ReactiveInputEvent => ({ type, payload: { value, segmentIndex: 0 } });

function collectIRPhases(): Set<string> {
  const out = new Set<string>();
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) {
      x.forEach(walk);
      return;
    }
    if (typeof x !== 'object' || x === null) return;
    const o = x as Record<string, unknown>;
    if (typeof o.phase === 'string') out.add(o.phase);
    for (const v of Object.values(o)) walk(v);
  };
  walk(beamSearchImperativeIR.functions);
  return out;
}

describe('beam-search — 셈', () => {
  it('여덟 조합이 사양 표와 같다', () => {
    for (const row of TABLE) {
      const run = runBeamSearch(clone(), row.width, row.erase);
      expect({
        text: run.words.join(' '),
        score: run.score,
        correct: run.correct,
        rank: run.rank,
        scored: run.scored,
        erased: run.erased,
      }).toEqual({
        text: row.text,
        score: row.score,
        correct: row.correct,
        rank: row.rank,
        scored: row.scored,
        erased: row.erased,
      });
    }
  });

  it('천분율은 반올림 — 142 · 150 · 74 · 128', () => {
    expect(toPermille(141_750)).toBe(142);
    expect(toPermille(150_000)).toBe(150);
    expect(toPermille(74_250)).toBe(74);
    expect(toPermille(127_500)).toBe(128);
  });

  it('동률은 네 번, 모두 빔 안쪽 — 폭 경계에서는 0 번', () => {
    let ties = 0;
    let boundary = 0;
    for (const row of TABLE) {
      for (const layer of runBeamSearch(clone(), row.width, row.erase).layers) {
        ties += layer.ties;
        if (layer.boundaryTie) boundary += 1;
      }
    }
    expect(ties).toBe(4);
    expect(boundary).toBe(0);
  });
});

describe('beam-search — IR 은 화면과 같은 답을 낸다', () => {
  it('여덟 조합에서 견준 후보 수 · 답 앞말 · 답 점수가 같다', () => {
    const t = encodeBeamTables(clone());
    for (const row of TABLE) {
      const run = runBeamSearch(clone(), row.width, row.erase);
      const beamNode = new Array<number>(8).fill(0);
      const beamScore = new Array<number>(8).fill(0);
      const candNode = new Array<number>(16).fill(0);
      const candScore = new Array<number>(16).fill(0);
      const scored = runIR(beamSearchImperativeIR, 'beamSearch', [
        t.child.slice(),
        t.prob.slice(),
        t.lastWord.slice(),
        t.ended.slice(),
        t.article.slice(),
        t.sound.slice(),
        row.width,
        row.erase,
        DATA.depth,
        beamNode,
        beamScore,
        candNode,
        candScore,
      ]);
      expect(scored).toBe(run.scored);
      expect(t.prefixes[beamNode[0]!]).toBe(run.words.join(' '));
      expect(beamScore[0]).toBe(run.score);
    }
  });

  it('32 비트 안 — 버퍼 길이와 사다리 끝값, 중간값 최대', () => {
    const t = encodeBeamTables(clone());
    const maxWidth = Math.max(...DATA.widths);
    expect(maxWidth).toBe(4);
    // 후보는 많아야 폭 × 한 줄의 가지 수 — 버퍼 16 안.
    expect(maxWidth * BEAM_ROW_SLOTS).toBeLessThanOrEqual(16);
    expect(DATA.depth).toBe(3);
    expect(t.child.length).toBe(t.prefixes.length * BEAM_ROW_SLOTS);
    expect(t.prefixes.length).toBe(25);
    // 중간값 최대 — 나무 전체에서 부모 점수 × 확률 (IR 의 `beamScore[b] * prob[…]`).
    const nodeScore = new Array<number>(t.prefixes.length).fill(0);
    nodeScore[0] = 1_000_000;
    let worst = 0;
    for (let n = 0; n < t.prefixes.length; n++) {
      for (let r = 0; r < BEAM_ROW_SLOTS; r++) {
        const c = t.child[n * BEAM_ROW_SLOTS + r]!;
        if (c === -1) continue;
        const product = nodeScore[n]! * t.prob[n * BEAM_ROW_SLOTS + r]!;
        worst = Math.max(worst, product);
        nodeScore[c] = Math.floor(product / 100);
      }
    }
    expect(worst).toBe(45_000_000);
    expect(worst).toBeLessThan(2 ** 31 - 1);
  });
});

describe('beam-search — 알고리즘', () => {
  it('reactive 로 등록된다', () => {
    clearRegistry();
    registerBeamSearch();
    expect(getAlgorithmMechanismKind('beamSearch')).toBe('reactive');
  });

  it('사다리가 손잡이 구간과 같고 첫 값이 기본이다', () => {
    const w = segmentsOf('width');
    const e = segmentsOf('erase');
    expect(w.map((s) => s.value)).toEqual(DATA.widths);
    expect(e.map((s) => s.value)).toEqual(DATA.erases);
    expect(w.findIndex((s) => s.default === true)).toBe(0);
    expect(e.findIndex((s) => s.default === true)).toBe(0);
  });

  it('회차마다 계기가 사양 표와 같다 — A → B → A 로 돌려도 쌓이지 않는다', async () => {
    const script: [number, number][] = [
      [1, 0], // 기본
      [3, 0],
      [3, 1],
      [1, 1],
      [1, 0],
      [4, 0],
      [4, 1],
      [2, 1],
      [2, 0],
      [4, 0],
    ];
    const inputs: ReactiveInputEvent[] = [];
    let [w, e] = script[0]!;
    for (const [nw, ne] of script.slice(1)) {
      if (nw !== w) inputs.push(knob('width', nw));
      if (ne !== e) inputs.push(knob('erase', ne));
      w = nw;
      e = ne;
    }
    // 우리 것이 아닌 입력과 사다리 밖 값은 흘린다.
    inputs.splice(1, 0, { type: 'advance' }, knob('width', 7));
    const f = fakeCtx(inputs);
    await beamSearchAlgorithm(f.ctx as unknown as FacetContext<BeamSearchData>);
    // 한 번에 손잡이 하나만 돌렸으므로 입력 하나 = 판 하나.
    expect(f.rounds.length).toBe(script.length + 2);
    const rounds = f.rounds.filter((_, i) => i !== 1 && i !== 2);
    rounds.forEach((m, i) => {
      const [width, erase] = script[i]!;
      const row = rowOf(erase, width);
      expect({ width, erase, ...m }).toEqual({
        width,
        erase,
        'scored-count': row.scored,
        'erased-count': row.erased,
        'best-permille': toPermille(row.score),
      });
    });
    expect([...f.metricNames].sort()).toEqual(['best-permille', 'erased-count', 'scored-count']);
  });

  it('phase 집합 — algorithm = IR = 걸음 경계마다 켜진 것', async () => {
    const irPhases = collectIRPhases();
    const f = fakeCtx([knob('erase', 1)]);
    await beamSearchAlgorithm(f.ctx as unknown as FacetContext<BeamSearchData>);
    const emitted = new Set(
      f.events
        .filter((ev) => ev.type === 'phase')
        .map((ev) => (ev.payload as { phase: string }).phase),
    );
    expect(f.events.filter((ev) => ev.type === 'phase').every((ev) => ev.silent === true)).toBe(true);
    expect([...emitted].sort()).toEqual([...irPhases].sort());
    expect([...f.litAtBoundary].sort()).toEqual([...irPhases].sort());
  });

  it('판마다 걸음 경계에 켜지는 phase — 지우기 켬은 넷 모두, 끔은 erase 뺀 셋', async () => {
    for (const row of TABLE) {
      // 그 조합 하나만 사다리로 두고 한 판을 돌려 켜진 것을 센다.
      const lit = new Set<string>();
      const solo = fakeCtx([]);
      (solo.ctx.data as BeamSearchData).widths = [row.width];
      (solo.ctx.data as BeamSearchData).erases = [row.erase];
      await beamSearchAlgorithm(solo.ctx as unknown as FacetContext<BeamSearchData>);
      for (const p of solo.litAtBoundary) lit.add(p);
      expect([...lit].sort()).toEqual(
        row.erase === 1 ? ['answer', 'erase', 'expand', 'prune'] : ['answer', 'expand', 'prune'],
      );
    }
  });
});

describe('beam-search — 화면', () => {
  it('mountView 로 올리고 한 판을 끝까지 그린다 · 캡션의 수가 셈과 같다', async () => {
    clearRegistry();
    registerBeamSearch();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(beamSearchStageView, container, {
      config: { type: 'beam-search-stage' },
      initialData: beamSearchFacet.initialData as Record<string, unknown>,
    });
    const svg = container.querySelector('svg')!;
    expect(svg).not.toBeNull();
    const projector = beamSearchProjector({ stage }, undefined);
    projector.onInit?.(beamSearchFacet.initialData);

    for (const [width, erase] of [
      [1, 1],
      [3, 0],
    ] as const) {
      const d = clone();
      d.widths = [width];
      d.erases = [erase];
      const f = fakeCtx([]);
      f.ctx.data = d;
      await beamSearchAlgorithm(f.ctx as unknown as FacetContext<BeamSearchData>);
      for (const ev of f.events) await projector.onEvent(ev);
      await new Promise((r) => setTimeout(r, 900));
      const row = rowOf(erase, width);
      const captionText = [...svg.querySelectorAll('text')].map((x) => x.textContent ?? '');
      const cap = captionText.find((s) => s.startsWith('Chosen: '));
      expect(cap).toBe(
        row.correct
          ? `Chosen: “${row.text}” · ${formatScore(row.score)}. Grammatical — rank ${row.rank} among grammatical sentences.`
          : `Chosen: “${row.text}” · ${formatScore(row.score)}. It breaks the article rule.`,
      );
      // 폭 칸 수가 띠 이름표에 뜬다.
      expect(captionText).toContain(`beam slots: ${width}`);
    }
    stage.destroy();
  });

  it('자료를 바꿔도 캡션의 수가 그 이름의 수다', async () => {
    // 표를 흔든다 — 1 등이 바뀌고 지우는 자리도 달라진다.
    const d = clone();
    d.rows[0]!.probs = [30, 50, 20];
    d.rows[2]!.probs = [20, 30, 50];
    for (const [width, erase] of [
      [2, 1],
      [3, 1],
      [4, 0],
    ] as const) {
      const captions: string[] = [];
      const stub = {
        setCaption: (s: string) => captions.push(s),
        destroy: () => undefined,
      };
      const projector = beamSearchProjector({ stage: stub }, undefined);
      const dd = JSON.parse(JSON.stringify(d)) as BeamSearchData;
      dd.widths = [width];
      dd.erases = [erase];
      const f = fakeCtx([]);
      f.ctx.data = dd;
      await beamSearchAlgorithm(f.ctx as unknown as FacetContext<BeamSearchData>);
      for (const ev of f.events) await projector.onEvent(ev);
      const run = runBeamSearch(dd, width, erase);
      const want: string[] = [];
      want.push(
        erase === 1
          ? `Beam width ${width}. Impossible words are erased before scoring.`
          : `Beam width ${width}. Every word the table offers is scored.`,
      );
      for (const layer of run.layers) {
        if (erase === 1 && layer.erased > 0) {
          want.push(
            `Depth ${layer.depth}: erased before scoring — ${layer.erased}. The article does not fit the sound that follows.`,
          );
        }
        const stems = new Set(layer.candidates.map((c) => c.parent)).size;
        const carried = layer.candidates.filter((c) => c.carried).length;
        want.push(
          carried > 0
            ? `Depth ${layer.depth}: stems ${stems}, new branches scored ${layer.scored}; finished lines carried as is ${carried}.`
            : `Depth ${layer.depth}: stems ${stems}, new branches scored ${layer.scored}.`,
        );
        want.push(
          `Only the top ${layer.kept.length} by score stay in the beam. Cut: ${layer.candidates.length - layer.kept.length}.`,
        );
      }
      want.push(
        run.correct
          ? `Chosen: “${run.words.join(' ')}” · ${formatScore(run.score)}. Grammatical — rank ${run.rank} among grammatical sentences.`
          : `Chosen: “${run.words.join(' ')}” · ${formatScore(run.score)}. It breaks the article rule.`,
      );
      expect(captions).toEqual(want);
      // 셈 자체도 손으로 본 값과 맞는지 한 조합만 박아 둔다 — an 이 1 등이 되고 an banana 가 지워진다.
      if (width === 2 && erase === 1) {
        expect(run.erased).toBe(2);
        expect(run.words.join(' ')).toBe('an apple .');
      }
    }
  });

  it('initialData 없이도 마운트에서 던지지 않는다', () => {
    const container = document.createElement('div');
    expect(() => mountView(beamSearchStageView, container, { config: {} }).destroy()).not.toThrow();
  });
});

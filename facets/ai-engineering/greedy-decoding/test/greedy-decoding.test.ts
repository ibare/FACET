// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  getAlgorithmMechanismKind,
  makeTranslator,
  mountView,
  type FacetRuntimeEvent,
  type IRStmt,
  type ProjectorViews,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computeGreedyDecodingResult,
  greedyDecodingAlgorithm,
  greedyDecodingFacet,
  greedyDecodingImperativeIR,
  greedyDecodingProjector,
  greedyDecodingStageView,
  lastWord,
  registerGreedyDecoding,
  toPermille,
  type GreedyDecodingData,
} from '../src/index.js';

const DATA = greedyDecodingFacet.initialData as unknown as GreedyDecodingData;
const clone = (): GreedyDecodingData => JSON.parse(JSON.stringify(DATA)) as GreedyDecodingData;

/** 사양 표 — 대조용. */
const SPEC = {
  1: { first: 40, text: 'to learn is to learn is', score: 14_400, permille: 14, repeats: 3 },
  2: { first: 35, text: 'by doing .', score: 252_000, permille: 252, repeats: 0 },
  3: { first: 25, text: 'practice .', score: 150_000, permille: 150, repeats: 0 },
} as const;

const INT32_MAX = 2 ** 31 - 1;

/** 부르는 쪽이 표를 번호로 편다 — 행 차례 뒤에 끝 표식. */
function irArgs(data: GreedyDecodingData, firstRank: number) {
  const ids = [...data.table.map((r) => r.word), data.endToken];
  const width = Math.max(...data.table.map((r) => r.next.length));
  const nextTok = new Array<number>(data.table.length * width).fill(-1);
  const nextProb = new Array<number>(data.table.length * width).fill(0);
  data.table.forEach((row, i) =>
    row.next.forEach((o, k) => {
      nextTok[i * width + k] = ids.indexOf(o.word);
      nextProb[i * width + k] = o.p;
    }),
  );
  const picked = new Array<number>(data.steps).fill(-1);
  const start = ids.indexOf(lastWord(data.prompt));
  const endTok = ids.indexOf(data.endToken);
  return { ids, width, nextTok, nextProb, picked, start, endTok };
}

function runWalk(data: GreedyDecodingData, firstRank: number) {
  const a = irArgs(data, firstRank);
  const score = runIR(greedyDecodingImperativeIR, 'greedyWalk', [
    a.nextTok, a.nextProb, a.width, a.start, firstRank, data.steps, a.endTok, a.picked,
  ]);
  const repeats = runIR(greedyDecodingImperativeIR, 'countRepeats', [a.picked, a.endTok]);
  return { ...a, score, repeats };
}

type Fake = {
  events: FacetRuntimeEvent[];
  metrics: Map<string, number>;
  /** waitForInput 에 닿을 때마다 찍은 계기 — 판마다 하나. */
  snapshots: Map<string, number>[];
  /** 걸음 경계(sleep · waitForInput)마다 켜져 있던 phase. */
  lit: Set<string>;
  emitted: Set<string>;
  run: Promise<void>;
};

/** 러너 없이 도는 reactive 문맥. sleep 은 곧바로 지난다. */
function fake(data: GreedyDecodingData, inputs: { type: string; payload?: unknown }[]): Fake {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const snapshots: Map<string, number>[] = [];
  const lit = new Set<string>();
  const emitted = new Set<string>();
  let current: string | null = null;
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') {
        const ph = (e.payload as { phase: string }).phase;
        current = ph;
        emitted.add(ph);
      }
    },
    metric(name: string, d: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (d === 'inc' ? 1 : d));
    },
    async sleep() {
      if (current) lit.add(current);
      return !cancelled;
    },
    async waitForInput() {
      if (current) lit.add(current);
      snapshots.push(new Map(metrics));
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
  };
  const run = greedyDecodingAlgorithm(ctx as never);
  return { events, metrics, snapshots, lit, emitted, run };
}

function irPhases(stmts: IRStmt[], into = new Set<string>()): Set<string> {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') into.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, into);
      if (s.else) irPhases(s.else, into);
    }
    if (s.kind === 'for-range' || s.kind === 'while') irPhases(s.body, into);
  }
  return into;
}
const IR_PHASES = (() => {
  const all = new Set<string>();
  for (const fn of greedyDecodingImperativeIR.functions) irPhases(fn.body, all);
  return all;
})();

const pick = (r: number) => ({ type: 'firstRank', payload: { value: r, segmentIndex: r - 1 } });

describe('greedyDecoding — 셈', () => {
  it.each([1, 2, 3] as const)('첫 걸음 등수 %i 가 사양 표와 같다', (r) => {
    const res = computeGreedyDecodingResult(DATA, r);
    expect(res.steps[0]!.p).toBe(SPEC[r].first);
    expect(res.words.join(' ')).toBe(SPEC[r].text);
    expect(res.score).toBe(SPEC[r].score);
    expect(res.permille).toBe(SPEC[r].permille);
    expect(res.repeats).toBe(SPEC[r].repeats);
  });

  it('대조 — 걸음 2 면 2 등이 이기고, 걸음 9 면 1 등만 2 까지 떨어진다', () => {
    const two = { ...clone(), steps: 2 };
    expect([1, 2, 3].map((r) => computeGreedyDecodingResult(two, r).permille)).toEqual([240, 280, 150]);
    const nine = { ...clone(), steps: 9 };
    expect([1, 2, 3].map((r) => computeGreedyDecodingResult(nine, r).permille)).toEqual([2, 252, 150]);
  });

  it('프롬프트는 사양 글 그대로이고 출발 낱말은 그 끝 낱말이다', () => {
    expect(DATA.prompt).toBe('The best way to learn is');
    expect(lastWord(DATA.prompt)).toBe('is');
  });

  it('동률 — 한 행에 같은 확률이 둘 있는 자리가 없다', () => {
    const ties = DATA.table.filter((row) => new Set(row.next.map((o) => o.p)).size !== row.next.length);
    expect(ties).toEqual([]);
  });
});

describe('greedyDecoding — IR 은 화면과 같은 답을 낸다', () => {
  it.each([1, 2, 3])('첫 걸음 등수 %i — 백만분율 · 되풀이 · 고른 번호', (r) => {
    const res = computeGreedyDecodingResult(DATA, r);
    const ir = runWalk(DATA, r);
    expect(ir.score).toBe(res.score);
    expect(ir.repeats).toBe(res.repeats);
    const expected = res.words.map((w) => ir.ids.indexOf(w));
    while (expected.length < DATA.steps) expected.push(-1);
    expect(ir.picked).toEqual(expected);
  });

  it('데이터를 바꿔도 셋이 함께 움직인다', () => {
    const d = clone();
    d.table[0]!.next[0]!.p = 30; // is → to
    d.table[2]!.next[0]!.p = 70; // learn → is
    for (const r of d.firstRanks) {
      const res = computeGreedyDecodingResult(d, r);
      const ir = runWalk(d, r);
      expect(ir.score).toBe(res.score);
      expect(ir.repeats).toBe(res.repeats);
    }
    // 300000 → 180000 → 126000 → 37800 → 22680 → 15876
    expect(computeGreedyDecodingResult(d, 1).score).toBe(15_876);
  });

  it('그 등수의 후보가 없으면 IR 과 algorithm 이 같은 자리에서 멈춘다', () => {
    const d = clone();
    d.table[0]!.next.pop(); // is 행에서 3 등을 지운다
    const res = computeGreedyDecodingResult(d, 3);
    expect(res.steps.length).toBe(0);
    const ir = runWalk(d, 3);
    expect(ir.score).toBe(res.score);
    expect(ir.score).toBe(1_000_000);
    expect(ir.repeats).toBe(0);
    expect(ir.picked).toEqual(new Array(d.steps).fill(-1));
  });

  it('32 비트 — 매개변수 길이와 사다리 끝값, 중간값 최대 40,000,000', () => {
    const a = irArgs(DATA, 1);
    expect(a.width).toBe(3);
    expect(a.nextTok.length).toBe(36);
    expect(a.picked.length).toBe(6);
    expect(Math.max(...DATA.firstRanks)).toBe(3);
    let maxProduct = 0;
    for (const r of DATA.firstRanks) {
      for (const st of computeGreedyDecodingResult(DATA, r).steps) maxProduct = Math.max(maxProduct, st.product);
    }
    expect(maxProduct).toBe(40_000_000);
    expect(maxProduct).toBeLessThanOrEqual(INT32_MAX);
  });
});

describe('greedyDecoding — 알고리즘', () => {
  it('등록하면 mechanismKind 가 reactive 다', () => {
    registerGreedyDecoding();
    expect(getAlgorithmMechanismKind('greedyDecoding')).toBe('reactive');
  });

  it('회차별 계기 — 1 → 2 → 1 → 3 → 2 로 돌려 판마다 사양 표와 같다', async () => {
    const f = fake(clone(), [pick(2), pick(1), pick(3), pick(2)]);
    await f.run;
    const ranks = [1, 2, 1, 3, 2] as const;
    expect(f.snapshots.length).toBe(ranks.length);
    ranks.forEach((r, i) => {
      const s = f.snapshots[i]!;
      expect({
        first: s.get('first-step-percent'),
        permille: s.get('sequence-permille'),
        repeats: s.get('repeat-count'),
      }).toEqual({ first: SPEC[r].first, permille: SPEC[r].permille, repeats: SPEC[r].repeats });
    });
  });

  it('처음 판에도 계기 이름 셋이 다 실린다 (차이 0 이어도)', async () => {
    const f = fake(clone(), [pick(2)]);
    await f.run;
    expect([...f.snapshots[0]!.keys()].sort()).toEqual(['first-step-percent', 'repeat-count', 'sequence-permille']);
  });

  it('사다리 밖의 값과 남의 입력은 흘린다', async () => {
    const f = fake(clone(), [
      { type: 'other' },
      { type: 'firstRank', payload: { value: 7 } },
      { type: 'firstRank', payload: { value: '2' } },
      pick(3),
    ]);
    await f.run;
    const starts = f.events.filter((e) => e.type === 'run-start').map((e) => (e.payload as { firstRank: number }).firstRank);
    expect(starts).toEqual([1, 3]);
  });

  it('phase — 발신 집합과 걸음 경계마다 켜진 집합이 IR 과 같다', async () => {
    for (const first of [1, 2, 3]) {
      const f = fake(clone(), first === 1 ? [] : [pick(first)]);
      await f.run;
      expect([...f.emitted].sort()).toEqual([...IR_PHASES].sort());
      expect([...f.lit].sort()).toEqual([...IR_PHASES].sort());
    }
  });

  it('phase 는 silent, 나머지는 silent 가 아니다', async () => {
    const f = fake(clone(), []);
    await f.run;
    for (const e of f.events) expect(Boolean(e.silent)).toBe(e.type === 'phase');
  });
});

describe('greedyDecoding — 선언', () => {
  it('손잡이 사다리가 1차 데이터와 같고 기본값은 1 이다', () => {
    const controls = (greedyDecodingFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider') as {
      action: string;
      segments: { value: number; default?: boolean }[];
    };
    expect(knob.action).toBe('firstRank');
    expect(knob.segments.map((s) => s.value)).toEqual(DATA.firstRanks);
    expect(knob.segments.find((s) => s.default)?.value).toBe(1);
  });

  it('메트릭 이름이 알고리즘이 부르는 이름과 같다', () => {
    const metrics = (greedyDecodingFacet.blocks.controls as { metrics: { name: string }[] }).metrics;
    expect(metrics.map((m) => m.name)).toEqual(['first-step-percent', 'sequence-permille', 'repeat-count']);
  });
});

describe('greedyDecoding — 화면', () => {
  function mountAll() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('en', greedyDecodingFacet.messages);
    const stage = mountView(greedyDecodingStageView, container, {
      config: { type: 'greedy-decoding-stage' },
      initialData: DATA as unknown as Record<string, unknown>,
      t,
      locale: 'en',
    });
    const seen: (string | null)[] = [];
    const views: ProjectorViews = {
      stage,
      codePanel: { highlightPhase: (p: string | null) => seen.push(p), destroy: () => undefined },
    };
    const projector = greedyDecodingProjector(views, { getSpeed: () => 1000, t });
    return { container, stage, projector, seen };
  }
  const caption = (c: HTMLElement) => {
    const texts = [...c.querySelectorAll('text')].map((n) => n.textContent ?? '');
    return texts.find((s) => /^(Step|The prompt|“|All|Words|No word)/.test(s)) ?? '';
  };

  it('initialData 가 없어도 마운트에서 던지지 않는다', () => {
    const c = document.createElement('div');
    expect(() => {
      const inst = mountView(greedyDecodingStageView, c, { config: {} });
      (inst as unknown as { beginRun(r: number, s: string, ms: number): void }).beginRun(1, 'is', 0);
      inst.destroy();
    }).not.toThrow();
  });

  it('판마다 캡션의 수가 셈한 값과 같고, 세로가 바뀌지 않는다', async () => {
    const { container, stage, projector, seen } = mountAll();
    const svg = container.querySelector('svg')!;
    const before = svg.getAttribute('viewBox');
    const f = fake(clone(), [pick(2), pick(1), pick(3)]);
    await f.run;

    let run = 0;
    const order = [1, 2, 1, 3];
    for (const e of f.events) {
      await projector.onEvent(e);
      const p = e.payload as Record<string, unknown>;
      if (e.type === 'advance') {
        const pct = toPermille(p.score as number);
        expect(caption(container)).toContain(`${Math.floor(pct / 10)}.${pct % 10}%`);
        expect(caption(container)).toContain(`× ${String(p.p)}%`);
      }
      if (e.type === 'finish') {
        const r = order[run]!;
        const pm = SPEC[r as 1 | 2 | 3].permille;
        expect(caption(container)).toContain(`${Math.floor(pm / 10)}.${pm % 10}%`);
        if (r === 1) expect(caption(container)).toContain('All 6 steps');
        else expect(caption(container)).toContain(`at step ${computeGreedyDecodingResult(DATA, r).steps.length}.`);
        run += 1;
      }
      if (e.type === 'tally') {
        const n = p.repeats as number;
        if (n > 0) expect(caption(container)).toContain(`: ${n}.`);
      }
    }
    expect(run).toBe(4);
    expect(seen.filter((s) => s !== null).length).toBeGreaterThan(0);
    // 걸어 본 등수는 표에 값이 선다.
    const texts = [...container.querySelectorAll('text')].map((n) => n.textContent);
    expect(texts).toContain('1.4%');
    expect(texts).toContain('25.2%');
    expect(texts).toContain('15.0%');
    expect(svg.getAttribute('viewBox')).toBe(before);
    stage.destroy();
  });
});

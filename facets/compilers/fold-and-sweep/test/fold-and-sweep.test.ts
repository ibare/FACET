// @vitest-environment happy-dom
/**
 * fold-and-sweep — facet 고유의 주장.
 *   1. 여섯 칸(폴딩 3 × DCE 2)이 사양 표와 같다
 *   2. runIR 의 돌려준 값 · stats 가 여섯 칸 모두 algorithm 과 같다 — 마디 번호 · 이름 번호를 섞어도
 *   3. 사다리 = segments[].value, 기본값 = segments 의 default, 매개변수 배열 길이
 *   4. 회차별 계기 — 손잡이 A → B → A 로 돌려 회차마다 사양 표와 견준다. 기본값 한 판의 걸음마다 계기
 *   5. 무대 — 판이 끝난 화면의 글자가 셈한 프로그램과 같다 (mountView 를 거친다)
 */
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  foldAndSweepAlgorithm,
  foldAndSweepFacet,
  foldAndSweepImperativeIR,
  foldAndSweepProjector,
  foldAndSweepStageView,
  readProgram,
  readSnapshot,
  rowText,
  rowTokens,
  runRound,
  type Expr,
  type FoldAndSweepData,
  type SnapRow,
} from '../src/index.js';

const data = foldAndSweepFacet.initialData as FoldAndSweepData;
const program = readProgram(data.program);

// 사양 표 (sim `fold-and-sweep`)
const TABLE: Record<string, { ops: number; lines: number; folded: number; subst: number; removed: number; passes: number; steps: number }> = {
  '0,0': { ops: 7, lines: 7, folded: 0, subst: 0, removed: 0, passes: 0, steps: 2 },
  '0,1': { ops: 6, lines: 6, folded: 0, subst: 0, removed: 1, passes: 2, steps: 5 },
  '1,0': { ops: 6, lines: 7, folded: 1, subst: 0, removed: 0, passes: 0, steps: 8 },
  '1,1': { ops: 5, lines: 6, folded: 1, subst: 0, removed: 1, passes: 2, steps: 11 },
  '2,0': { ops: 3, lines: 7, folded: 4, subst: 6, removed: 0, passes: 0, steps: 8 },
  '2,1': { ops: 2, lines: 2, folded: 4, subst: 6, removed: 5, passes: 2, steps: 11 },
};
const COMBOS = [0, 1, 2].flatMap((f) => [0, 1].map((s) => [f, s] as const));

// ── IR 인자 — 부르는 쪽이 번호를 짓는다
const NAMES = ['rate', 'tax', 'base', 'fee', 'unused', 'n'];

function lcg(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}
function shuffled<T>(xs: T[], rnd: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function flatten(rows: SnapRow[], names: string[], perm: (id: number) => number) {
  const nodes: Expr[] = [];
  const walk = (e: Expr): void => {
    nodes.push(e);
    if (e.k === 'op') {
      walk(e.l);
      walk(e.r);
    }
  };
  const lineName: number[] = [];
  const lineRoot: number[] = [];
  let retRoot = -1;
  for (const row of rows) {
    const s = row.stmt;
    if (s.k === 'function') continue;
    walk(s.value);
    if (s.k === 'let') {
      lineName.push(names.indexOf(s.name));
      lineRoot.push(perm(s.value.id));
    } else retRoot = perm(s.value.id);
  }
  const size = nodes.length;
  const kind = new Array<number>(size).fill(0);
  const left = new Array<number>(size).fill(-1);
  const right = new Array<number>(size).fill(-1);
  const val = new Array<number>(size).fill(0);
  for (const e of nodes) {
    const i = perm(e.id);
    if (e.k === 'num') val[i] = e.v;
    else if (e.k === 'var') {
      kind[i] = 1;
      val[i] = names.indexOf(e.name);
    } else {
      kind[i] = e.op === '+' ? 2 : e.op === '-' ? 3 : 4;
      left[i] = perm(e.l.id);
      right[i] = perm(e.r.id);
    }
  }
  return { kind, left, right, val, lineName, lineRoot, retRoot };
}

function irRun(fold: number, sweep: number, names = NAMES, perm: (id: number) => number = (x) => x) {
  const f = flatten(program, names, perm);
  const nn = names.length;
  const stats = [0, 0, 0, 0];
  const ops = runIR(foldAndSweepImperativeIR, 'optimize', [
    f.kind,
    f.left,
    f.right,
    f.val,
    f.lineName,
    f.lineRoot,
    f.retRoot,
    fold,
    sweep,
    new Array<number>(nn).fill(0),
    new Array<number>(nn).fill(0),
    new Array<number>(f.lineRoot.length).fill(0),
    new Array<number>(nn).fill(0),
    stats,
  ]);
  return { ops, folded: stats[0], subst: stats[1], removed: stats[2], lines: stats[3], size: f.kind.length };
}

// ── 알고리즘 구동 — 판마다 걸음별 계기와 phase 를 모은다
type Round = { steps: number[][]; phases: (string | null)[]; events: FacetRuntimeEvent[] };
const METRICS = ['exec-ops', 'code-lines', 'folded-nodes', 'removed-lines'];

async function drive(inputs: { type: string; payload: { value: number } }[]): Promise<Round[]> {
  const totals = new Map<string, number>();
  const rounds: Round[] = [];
  let cur: Round = { steps: [], phases: [], events: [] };
  let lastPhase: string | null = null;
  const snap = (): void => {
    cur.steps.push(METRICS.map((m) => totals.get(m) ?? 0));
    cur.phases.push(lastPhase);
    lastPhase = null;
  };
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const done = new Promise<void>((r) => (idle = r));
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent) {
      cur.events.push(e);
      const p = e.payload as { phase?: unknown } | undefined;
      if (e.type === 'phase' && typeof p?.phase === 'string') lastPhase = p.phase;
    },
    async sleep() {
      snap();
      return !cancelled;
    },
    async waitForInput() {
      snap();
      rounds.push(cur);
      cur = { steps: [], phases: [], events: [] };
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([foldAndSweepAlgorithm(ctx as never), done]);
  cancelled = true;
  return rounds;
}

describe('fold-and-sweep', () => {
  it('여섯 칸이 사양 표와 같다', () => {
    for (const [f, s] of COMBOS) {
      const r = runRound(program, f, s);
      const { rows: _rows, ...got } = r;
      expect(got, `폴딩 ${f} × DCE ${s}`).toEqual(TABLE[`${f},${s}`]);
    }
    // 끝 프로그램 — 기본값은 두 줄
    const end = runRound(program, 2, 1).rows.filter((r) => r.alive).map(rowText);
    expect(end).toEqual(['function price(n)', 'return n * 30 + 600']);
    const noSweep = runRound(program, 2, 0).rows.map(rowText);
    expect(noSweep).toEqual([
      'function price(n)',
      'let rate = 3',
      'let tax = 30',
      'let base = 3600',
      'let fee = 600',
      'let unused = n * 600',
      'return n * 30 + 600',
    ]);
  });

  it('runIR 이 여섯 칸 모두 algorithm 과 같은 답을 낸다 — 번호를 섞어도', () => {
    for (const [f, s] of COMBOS) {
      const a = runRound(program, f, s);
      const b = irRun(f, s);
      expect({ ops: b.ops, folded: b.folded, subst: b.subst, removed: b.removed, lines: b.lines }).toEqual({
        ops: a.ops,
        folded: a.folded,
        subst: a.subst,
        removed: a.removed,
        lines: a.lines,
      });
    }
    const rnd = lcg(7);
    for (let k = 0; k < 20; k += 1) {
      const names = shuffled(NAMES, rnd);
      const order = shuffled([...Array(20).keys()], rnd);
      for (const [f, s] of COMBOS) {
        const a = runRound(program, f, s);
        const b = irRun(f, s, names, (id) => order[id]!);
        expect([b.ops, b.folded, b.subst, b.removed, b.lines]).toEqual([a.ops, a.folded, a.subst, a.removed, a.lines]);
      }
    }
  });

  it('모르는 마디 종류 — IR 은 -1 을 돌려주고 TS 는 던진다 (같은 자리에서 거절)', () => {
    const f = flatten(program, NAMES, (x) => x);
    const nn = NAMES.length;
    const bad = [...f.kind];
    bad[1] = 5; // L3 의 `*` 자리를 모르는 연산으로
    const args = (kind: number[]) => [
      kind, f.left, f.right, [...f.val], f.lineName, f.lineRoot, f.retRoot, 2, 1,
      new Array<number>(nn).fill(0), new Array<number>(nn).fill(0), new Array<number>(5).fill(0), new Array<number>(nn).fill(0), [0, 0, 0, 0],
    ];
    expect(runIR(foldAndSweepImperativeIR, 'optimize', args(bad))).toBe(-1);
    expect(runIR(foldAndSweepImperativeIR, 'optimize', args([...f.kind.slice(0, 1), -1, ...f.kind.slice(2)]))).toBe(-1);
    // 도우미도 제각각 거절한다 — `*` 로 셈하거나 연산으로 세지 않는다
    expect(runIR(foldAndSweepImperativeIR, 'foldExpr', [1, bad, f.left, f.right, [...f.val], 2, new Array(nn).fill(0), new Array(nn).fill(0), [0, 0, 0, 0]])).toBe(-1);
    expect(runIR(foldAndSweepImperativeIR, 'countOps', [1, bad, f.left, f.right])).toBe(-1);
    const uses = new Array<number>(nn).fill(0);
    runIR(foldAndSweepImperativeIR, 'countUses', [1, bad, f.left, f.right, f.val, uses]);
    expect(uses).toEqual(new Array(nn).fill(0));
    // TS 쪽 — 같은 자리(모르는 연산)에서 던진다
    const src = structuredClone(data.program) as unknown as { stmt: { value?: { op?: string } } }[];
    src[2]!.stmt.value!.op = '/';
    expect(() => readProgram(src)).toThrow(/모르는 연산/);
    expect(() => readSnapshot([{ indent: 0, alive: true, stmt: { k: 'function', name: 'price', params: [1] } }])).toThrow(/매개변수/);
  });

  it('사다리 · 기본값 · 배열 길이', () => {
    const controls = (foldAndSweepFacet.blocks.controls as { controls: unknown[] }).controls as {
      widget?: string;
      action?: string;
      segments?: { value: number; default?: boolean }[];
    }[];
    const knob = (a: string) => controls.find((c) => c.widget === 'segmented-slider' && c.action === a)!;
    expect(knob('fold').segments!.map((s) => s.value)).toEqual(data.foldLadder);
    expect(knob('sweep').segments!.map((s) => s.value)).toEqual(data.sweepLadder);
    expect(knob('fold').segments!.find((s) => s.default)!.value).toBe(data.fold);
    expect(knob('sweep').segments!.find((s) => s.default)!.value).toBe(data.sweep);
    expect(data.foldLadder.at(-1)).toBe(2);
    expect(data.sweepLadder.at(-1)).toBe(1);
    const f = irRun(2, 1);
    expect(f.size).toBe(20); // 마디 20
    expect(program.length).toBe(7); // 줄 7 — 무대가 잡는 세로
    expect(flatten(program, NAMES, (x) => x).lineRoot.length).toBe(5);
  });

  it('회차별 계기 — 기본값 → 폴딩 끔 → 기본값, 그리고 DCE 끔', async () => {
    const rounds = await drive([
      { type: 'fold', payload: { value: 0 } },
      { type: 'fold', payload: { value: 2 } },
      { type: 'sweep', payload: { value: 0 } },
    ]);
    expect(rounds.length).toBe(4);
    const expectRound = (r: Round, key: string) => {
      const row = TABLE[key]!;
      expect(r.steps.length, `${key} 걸음`).toBe(row.steps);
      expect(r.steps.at(-1), `${key} 끝 계기`).toEqual([row.ops, row.lines, row.folded, row.removed]);
      expect(r.steps[0], `${key} 걸음 0`).toEqual([7, 7, 0, 0]);
    };
    expectRound(rounds[0]!, '2,1');
    expectRound(rounds[1]!, '0,1');
    expectRound(rounds[2]!, '2,1');
    expectRound(rounds[3]!, '2,0');
    // 기본값 한 판의 걸음마다 계기 (사양)
    expect(rounds[0]!.steps).toEqual([
      [7, 7, 0, 0],
      [7, 7, 0, 0],
      [6, 7, 1, 0],
      [5, 7, 2, 0],
      [3, 7, 4, 0],
      [3, 7, 4, 0],
      [3, 7, 4, 0],
      [3, 7, 4, 0],
      [2, 2, 4, 5],
      [2, 2, 4, 5],
      [2, 2, 4, 5],
    ]);
    // 걸음마다 phase 하나 (걸음 0 은 없다)
    expect(rounds[0]!.phases).toEqual([
      null,
      'fold-known',
      'fold-known',
      'fold-known',
      'fold-known',
      'fold-line',
      'fold-line',
      'sweep-count',
      'sweep-remove',
      'sweep-count',
      'count-ops',
    ]);
    expect(rounds[1]!.phases).toEqual([null, 'sweep-count', 'sweep-remove', 'sweep-count', 'count-ops']);
    expect(rounds[1]!.steps).toEqual([
      [7, 7, 0, 0],
      [7, 7, 0, 0],
      [6, 6, 0, 1],
      [6, 6, 0, 1],
      [6, 6, 0, 1],
    ]);
  });

  it('무대 — 판이 끝난 화면의 글자가 셈한 프로그램과 같다', async () => {
    const rounds = await drive([{ type: 'fold', payload: { value: 1 } }]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('ko', foldAndSweepFacet.messages);
    const stage = mountView(foldAndSweepStageView, container, {
      config: { type: 'fold-and-sweep-stage' },
      initialData: data,
      locale: 'ko',
      t,
      isInstant: () => true,
    });
    const projector = foldAndSweepProjector({ stage }, { getSpeed: () => 1, t });
    projector.onInit?.(data);
    const visibleRows = (): string[][] => {
      const svg = container.querySelector('svg')!;
      const layer = svg.querySelector('g')!.children[4]!; // 줄 층
      const out: string[][] = [];
      for (const g of Array.from(layer.children)) {
        if (g.getAttribute('opacity') !== '1') continue;
        const toks = Array.from(g.querySelectorAll('text'))
          .filter((x) => x.getAttribute('font-family')?.includes('mono') && x.getAttribute('opacity') === '1' && !x.closest('g[opacity="0"]'))
          .filter((x) => x.parentElement === g)
          .map((x) => ({ text: x.textContent ?? '', x: Number(/translate\(([-\d.]+)/.exec(x.getAttribute('transform') ?? '')![1]) }))
          .sort((a, b) => a.x - b.x)
          .map((x) => x.text);
        out.push(toks);
      }
      return out;
    };
    for (const [i, key] of [[0, '2,1'], [1, '1,1']] as const) {
      for (const e of rounds[i]!.events) await projector.onEvent(e);
      const [f, s] = key.split(',').map(Number) as [number, number];
      const expected = runRound(program, f, s)
        .rows.map((row, line) => ({ row, line }))
        .filter((x) => x.row.alive)
        .map((x) => rowTokens(x.row, x.line).map((tok) => tok.text));
      expect(visibleRows(), key).toEqual(expected);
      const r = TABLE[key]!;
      expect(container.textContent).toContain(`셈: 실행 연산 ${r.ops} · 줄 ${r.lines}`);
    }
  });
});

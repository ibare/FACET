// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { mountView } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  backtrack,
  buildFiles,
  myersDiffAlgorithm,
  traceMyers,
  type MyersDiffData,
} from '../src/algorithm.js';
import { myersDiffFacet } from '../src/facet.js';
import { myersDiffImperativeIR } from '../src/irs.js';
import { listRowGap, listRowY, myersDiffStageView } from '../src/myers-diff-stage.js';

const data = myersDiffFacet.initialData as MyersDiffData;

/** 사양 실측표 — k → [D, endpoints, slides(N 별)] */
const TABLE: Record<number, { d: number; endpoints: number; slidesMinusN: number; steps: number }> = {
  0: { d: 0, endpoints: 1, slidesMinusN: 0, steps: 3 },
  1: { d: 2, endpoints: 5, slidesMinusN: -1, steps: 7 },
  2: { d: 4, endpoints: 13, slidesMinusN: -2, steps: 11 },
  3: { d: 6, endpoints: 25, slidesMinusN: -3, steps: 15 },
  4: { d: 8, endpoints: 41, slidesMinusN: -4, steps: 19 },
};
const CHANGED: Record<string, number[]> = {
  '1,10': [6], '1,20': [11], '1,30': [16], '1,40': [21],
  '2,10': [4, 7], '2,20': [7, 13], '2,30': [11, 21], '2,40': [14, 27],
  '3,10': [3, 5, 7], '3,20': [6, 11, 16], '3,30': [8, 15, 22], '3,40': [11, 21, 31],
  '4,10': [3, 5, 7, 9], '4,20': [5, 9, 13, 17], '4,30': [7, 13, 19, 25], '4,40': [9, 17, 25, 33],
};

/** 줄 → 정수 번호. A 다음 B 차례로 처음 나온 글자에 0, 1, 2 … */
function ids(a: readonly string[], b: readonly string[]): [number[], number[]] {
  const table = new Map<string, number>();
  const conv = (f: readonly string[]) =>
    f.map((line) => {
      const found = table.get(line);
      if (found !== undefined) return found;
      table.set(line, table.size);
      return table.size - 1;
    });
  const ia = conv(a);
  const ib = conv(b);
  return [ia, ib];
}

function irRun(a: readonly string[], b: readonly string[]): { d: number; endpoints: number; slides: number; buf: number } {
  const [ia, ib] = ids(a, b);
  const buf = 2 * (ia.length + ib.length + 1) + 1;
  const v = new Array<number>(buf).fill(0);
  const stats = [0, 0];
  const d = runIR(myersDiffImperativeIR, 'myersCost', [ia, ib, v, stats]);
  if (typeof d !== 'number') throw new Error('myersCost 가 수를 돌려주지 않았다');
  const [endpoints, slides] = stats;
  if (endpoints === undefined || slides === undefined) throw new Error('stats 가 비었다');
  return { d, endpoints, slides, buf };
}

type Round = { metrics: Record<string, number>; steps: number; phases: string[]; rows: number };

/** 가짜 reactive 문맥 — 입력 차례대로 판을 돌리고 판마다 계기 끝값을 모은다 */
async function play(inputs: { type: string; value: number }[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const metrics: Record<string, number> = {};
  let cur: Round | null = null;
  const queue = [...inputs];
  const state = { cancelled: false };
  const flush = () => {
    if (cur) cur.metrics = { ...metrics };
  };
  const ctx = {
    data,
    get cancelled() {
      return state.cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      if (e.type === 'round-start') {
        // 앞 판의 끝값은 waitForInput 에서 이미 모았다 — 계기는 이 이벤트 앞에 걸음 0 값으로 바뀐다
        cur = { metrics: {}, steps: 0, phases: [], rows: 0 };
        rounds.push(cur);
      }
      if (!cur) throw new Error('round-start 앞에 이벤트');
      if (e.type === 'phase') {
        const p = e.payload as { phase: string };
        cur.phases.push(p.phase);
      }
      if (e.type === 'fold') cur.rows = (e.payload as { rows: unknown[] }).rows.length;
      if (e.silent !== true) cur.steps += 1;
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !state.cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      flush();
      const next = queue.shift();
      if (next === undefined) {
        state.cancelled = true;
        return { type: 'end' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
  };
  await myersDiffAlgorithm(ctx as unknown as FacetContext<MyersDiffData>);
  flush();
  return rounds;
}

describe('myers-diff', () => {
  it('데이터 — 줄 마흔이 모두 다르고 사다리 끝값과 같다, 사다리 = segments', () => {
    expect(data.lines).toHaveLength(40);
    expect(new Set(data.lines).size).toBe(40);
    expect(data.lengthLadder[data.lengthLadder.length - 1]).toBe(data.lines.length);
    expect(data.newLines.filter((l) => data.lines.includes(l))).toEqual([]);
    const controls = (myersDiffFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (action: string) => controls.find((c) => c.action === action)?.segments ?? [];
    expect(seg('edits').map((s) => s.value)).toEqual(data.editLadder);
    expect(seg('length').map((s) => s.value)).toEqual(data.lengthLadder);
    expect(seg('edits').find((s) => s.default)?.value).toBe(data.edits);
    expect(seg('length').find((s) => s.default)?.value).toBe(data.length);
    expect(data.editLadder[data.editLadder.length - 1]).toBe(data.newLines.length);
  });

  it('스무 칸 — algorithm 계기 끝값 = runIR = 사양 표, 바꾼 줄 · 걸음 수 · 남김도', async () => {
    for (const k of data.editLadder) {
      for (const n of data.lengthLadder) {
        const [round] = await playAt(k, n);
        const row = TABLE[k];
        if (!row || !round) throw new Error(`표에 k=${k} 가 없다`);
        const want = {
          'edit-cost': row.d,
          endpoints: row.endpoints,
          slides: n + row.slidesMinusN,
          'table-cells': (n + 1) * (n + 1),
        };
        expect(round.metrics, `k=${k} N=${n}`).toEqual(want);
        expect(round.steps, `걸음 k=${k} N=${n}`).toBe(row.steps);
        // 편집 목록이 범례 위, 캔버스 안에 든다
        expect(listRowY(round.rows - 1, round.rows), `목록 k=${k} N=${n}`).toBeLessThanOrEqual(440);
        expect(listRowGap(round.rows)).toBeGreaterThanOrEqual(14);
        const { a, b, spots } = buildFiles(data.lines, data.newLines, n, k);
        expect(spots.map((s) => s + 1)).toEqual(CHANGED[`${k},${n}`] ?? []);
        const ir = irRun(a, b);
        expect({ d: ir.d, e: ir.endpoints, s: ir.slides }).toEqual({ d: row.d, e: row.endpoints, s: n + row.slidesMinusN });
        expect(ir.buf).toBe(2 * (2 * n + 1) + 1);
        // 편집 목록 — 바꾼 자리마다 지움 다음 넣음, 남김 N − k
        const moves = backtrack(a, b, traceMyers(a, b));
        expect(moves.filter((m) => m.kind === 'keep')).toHaveLength(n - k);
        const edits = moves.filter((m) => m.kind !== 'keep').map((m) => m.kind);
        expect(edits).toEqual(Array.from({ length: k }, () => ['del', 'ins']).flat());
      }
    }
    expect(irRun(...(() => { const f = buildFiles(data.lines, data.newLines, 40, 4); return [f.a, f.b] as const; })()).buf).toBe(163);
  });

  it('기본 판의 phase 셋이 모두 나온다', async () => {
    const [round] = await play([]);
    expect(new Set(round?.phases)).toEqual(new Set(['pay', 'slide', 'reach-end']));
    expect(round?.steps).toBe(11);
  });

  it('회차별 계기 — k 2 → 4 → 2 (N=20), 누적하지 않는다', async () => {
    const rounds = await play([
      { type: 'edits', value: 4 },
      { type: 'edits', value: 2 },
    ]);
    const pick = (r: Round) => [r.metrics['edit-cost'], r.metrics.endpoints, r.metrics.slides, r.metrics['table-cells']];
    expect(rounds.map(pick)).toEqual([
      [4, 13, 18, 441],
      [8, 41, 16, 441],
      [4, 13, 18, 441],
    ]);
  });

  it('사다리 밖 값 · 모르는 입력은 판을 바꾸지 않는다', async () => {
    const rounds = await play([
      { type: 'edits', value: 7 },
      { type: 'other', value: 1 },
      { type: 'length', value: 40 },
    ]);
    expect(rounds).toHaveLength(2);
    expect(rounds[1]?.metrics['table-cells']).toBe(1681);
  });

  it('섞은 데이터 — 바꿈 · 지움 · 넣음 · 옮김을 섞어도 IR 과 algorithm 이 같은 길로 센다', () => {
    // measure.py 의 lcg(11) 와 같은 생성기
    let s = 11n;
    const g = (): number => {
      s = (s * 1103515245n + 12345n) % 2147483648n;
      return Number(s);
    };
    let worst = 0;
    for (let trial = 0; trial < 20; trial += 1) {
      const n = data.lengthLadder[g() % 4] ?? 0;
      const a = data.lines.slice(0, n);
      const b = a.slice();
      const ops = g() % 6;
      for (let q = 0; q < ops; q += 1) {
        const op = g() % 4;
        const p = g() % Math.max(1, b.length);
        if (op === 0 && b.length > 0) b[p] = data.newLines[g() % 4] ?? '';
        else if (op === 1 && b.length > 0) b.splice(p, 1);
        else if (op === 2) b.splice(p, 0, data.newLines[g() % 4] ?? '');
        else if (b.length > 0) {
          const to = g() % b.length;
          const [moved] = b.splice(p, 1);
          b.splice(to, 0, moved ?? '');
        }
      }
      const tr = traceMyers(a, b, false);
      const endpoints = tr.layers.reduce((acc, l) => acc + l.length, 0);
      const slides = tr.layers.reduce((acc, l) => acc + l.reduce((x, e) => x + e.slide, 0), 0);
      const ir = irRun(a, b);
      expect({ d: ir.d, e: ir.endpoints, s: ir.slides }, `trial ${trial}`).toEqual({ d: tr.d, e: endpoints, s: slides });
      worst = Math.max(worst, ir.buf, endpoints, slides);
    }
    expect(worst).toBe(163);
  });

  it('조각 diagonal-is-free 의 두 파일 — D 2 · 끝점 5 · 미끄러짐 6', () => {
    const a = ['let n = 10', 'let sum = 0', 'for i from 1 to n', '    let sq = i * i', '    sum = sum + sq', '    show i', 'show sum'];
    const b = ['let n = 10', 'let sum = 0', 'show n', 'for i from 1 to n', '    let sq = i * i', '    sum = sum + sq', 'show sum'];
    const tr = traceMyers(a, b);
    const endpoints = tr.layers.reduce((acc, l) => acc + l.length, 0);
    const slides = tr.layers.reduce((acc, l) => acc + l.reduce((x, e) => x + e.slide, 0), 0);
    expect([tr.d, endpoints, slides]).toEqual([2, 5, 6]);
    const ir = irRun(a, b);
    expect([ir.d, ir.endpoints, ir.slides]).toEqual([2, 5, 6]);
  });

  it('판 밖 끝점이면 algorithm 은 던진다', () => {
    // N=6 · k=3 은 판 밖으로 나간다 (사양 — 그래서 사다리에서 뺐다)
    const { a, b } = buildFiles(data.lines, data.newLines, 6, 3);
    expect(() => traceMyers(a, b)).toThrow(/판 밖/);
  });

  it('무대 — mountView 로 마운트되고 initialData 없이도 던지지 않는다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(myersDiffStageView, container, { config: {} });
    expect(inst).toBeTruthy();
    inst.destroy();
  });
});

async function playAt(k: number, n: number): Promise<Round[]> {
  const inputs: { type: string; value: number }[] = [];
  if (n !== data.length) inputs.push({ type: 'length', value: n });
  if (k !== data.edits) inputs.push({ type: 'edits', value: k });
  const rounds = await play(inputs);
  const last = rounds[rounds.length - 1];
  return last ? [last] : [];
}

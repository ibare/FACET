/**
 * hoist-invariant 의 장면.
 *
 * 바탕   lines — 처음 프로그램의 줄 (initial 이 initialData 에서 베낀다)
 * 자취   rows (지금 줄 차례) · indent (줄마다 지금 들여쓰기) · verdicts (판정) · lifted (꺼낸 줄)
 * 이번   step — 시작 · 판정한 줄 · 옮긴 줄(옮기기 전 자리와 들여쓰기를 계기값으로)
 *
 * 줄 번호(line)는 처음 프로그램의 자리(0 부터)로 늘 같다 — 옮겨도 L4 는 L4 다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  loopOf,
  readProgram,
  stmtOps,
  tripsOf,
  type Block,
  type CodeLine,
  type Read,
  type ReadFrom,
} from './algorithm.js';

export { stmtTokens, type Tok, type CodeLine, type Read, type ReadFrom, type Block } from './algorithm.js';

export type HoistVerdict = { invariant: boolean; block: Block; reads: Read[] };

export type HoistStep =
  | { kind: 'start' }
  | { kind: 'judge'; line: number }
  | { kind: 'lift'; line: number; fromRow: number; toRow: number; fromIndent: number };

export type HoistInvariantScene = {
  lines: CodeLine[];
  rows: number[];
  indent: number[];
  verdicts: (HoistVerdict | null)[];
  lifted: number[];
  step: HoistStep;
};

/** 줄마다 한 칸씩인 목록에서 읽는다 — 칸이 없으면 던진다. */
export function cell(list: readonly number[], li: number): number {
  const v = list[li];
  if (v === undefined) throw new Error(`L${li + 1}: 셈 칸이 없다`);
  return v;
}

/** 지금 장면의 반복 — 머리줄 · 몸 · 줄마다 도는 횟수 · 셈. 그림과 장면이 같이 쓴다. */
export function tally(scene: HoistInvariantScene): {
  head: number;
  headRow: number;
  body: number[];
  runs: number[];
  ops: number[];
  perTurn: number;
  executed: number;
  trips: number;
} {
  const { head, headRow, body } = loopOf(scene.lines, scene.rows, scene.indent);
  const headLine = scene.lines[head];
  if (!headLine) throw new Error(`L${head + 1}: 줄이 없다`);
  const trips = tripsOf(headLine.stmt);
  const ops = scene.lines.map((ln) => stmtOps(ln.stmt));
  const runs = scene.lines.map((_, li) => (body.includes(li) ? trips : 1));
  let perTurn = 0;
  for (const li of body) perTurn += cell(ops, li);
  let executed = 0;
  scene.lines.forEach((_, li) => {
    executed += cell(ops, li) * cell(runs, li);
  });
  return { head, headRow, body, runs, ops, perTurn, executed, trips };
}

const FROMS: readonly ReadFrom[] = ['outer', 'loop', 'invariant', 'body'];
const BLOCKS: readonly Block[] = ['none', 'reassigned', 'call'];

function lineIndex(v: unknown, scene: HoistInvariantScene, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= scene.lines.length) {
    throw new Error(`${what}: 줄 번호가 틀렸다 — ${String(v)}`);
  }
  return v;
}

function readReads(v: unknown, scene: HoistInvariantScene): Read[] {
  if (!Array.isArray(v)) throw new Error('judge: reads 가 목록이 아니다');
  return v.map((r): Read => {
    if (typeof r !== 'object' || r === null) throw new Error('judge: 읽는 이름이 객체가 아니다');
    const name: unknown = 'name' in r ? r.name : undefined;
    const from: unknown = 'from' in r ? r.from : undefined;
    const at: unknown = 'at' in r ? r.at : undefined;
    if (typeof name !== 'string') throw new Error('judge: 읽는 이름이 글자가 아니다');
    const f = FROMS.find((x) => x === from);
    if (!f) throw new Error(`judge: 모르는 출처 ${String(from)}`);
    return { name, from: f, at: lineIndex(at, scene, 'judge.reads') };
  });
}

export const hoistInvariantScene: ScenePlan<HoistInvariantScene> = {
  initial(initialData: unknown): HoistInvariantScene {
    const { lines } = readProgram(initialData);
    return {
      lines,
      rows: lines.map((_, i) => i),
      indent: lines.map((ln) => ln.indent),
      verdicts: lines.map(() => null),
      lifted: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: HoistInvariantScene, event: FacetRuntimeEvent): HoistInvariantScene {
    const p: unknown = event.payload;
    if (event.type === 'judge') {
      if (typeof p !== 'object' || p === null) throw new Error('judge: payload 가 없다');
      const line = lineIndex('line' in p ? p.line : undefined, scene, 'judge');
      const invariant: unknown = 'invariant' in p ? p.invariant : undefined;
      if (typeof invariant !== 'boolean') throw new Error('judge: invariant 가 참거짓이 아니다');
      const blockRaw: unknown = 'block' in p ? p.block : undefined;
      const block = BLOCKS.find((b) => b === blockRaw);
      if (!block) throw new Error(`judge: 모르는 막힘 ${String(blockRaw)}`);
      const reads = readReads('reads' in p ? p.reads : undefined, scene);
      const verdicts = scene.verdicts.slice();
      verdicts[line] = { invariant, block, reads };
      return { ...scene, verdicts, step: { kind: 'judge', line } };
    }
    if (event.type === 'lift') {
      if (typeof p !== 'object' || p === null) throw new Error('lift: payload 가 없다');
      const line = lineIndex('line' in p ? p.line : undefined, scene, 'lift');
      const { head, headRow } = loopOf(scene.lines, scene.rows, scene.indent);
      const fromRow = scene.rows.indexOf(line);
      if (fromRow <= headRow) throw new Error(`lift: L${line + 1} 이 반복의 몸에 없다`);
      const fromIndent = scene.indent[line];
      const headIndent = scene.indent[head];
      if (fromIndent === undefined || headIndent === undefined) throw new Error('lift: 들여쓰기가 없다');
      const rows = scene.rows.filter((li) => li !== line);
      rows.splice(headRow, 0, line);
      const indent = scene.indent.slice();
      indent[line] = headIndent;
      return {
        ...scene,
        rows,
        indent,
        lifted: [...scene.lifted, line],
        step: { kind: 'lift', line, fromRow, toRow: headRow, fromIndent },
      };
    }
    return scene;
  },
};

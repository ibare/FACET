/**
 * fold-at-compile 장면.
 *
 * - 바탕: `lines` — 앞 프로그램의 줄과 구조 (`initial()` 이 `initialData` 에서 베낀다)
 * - 자취: `folded` (접은 마디와 그 값) · `kept` (그대로 둔 마디와 막은 쪽)
 * - 이번 걸음: `step`
 *
 * 줄마다 지금 찍히는 글자(`lineView`)는 자취에서 파생한다. 장면과 그림이 같은 함수를 부른다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  countOps,
  exprTokens,
  readProgram,
  stmtExpr,
  stmtHead,
  type Expr,
  type ExprToken,
  type ProgLine,
  type Side,
} from './algorithm.js';

export type FoldMark = { line: number; path: string; value: number };
export type KeepMark = { line: number; path: string; blocked: Side };

export type FoldStep =
  | { kind: 'fold'; line: number; path: string; value: number }
  | { kind: 'keep'; line: number; path: string; blocked: Side };

export type FoldScene = {
  lines: ProgLine[];
  folded: FoldMark[];
  kept: KeepMark[];
  step: FoldStep | null;
};

/** 줄 안의 글자 조각 하나. `col` 은 줄 첫머리(들여쓰기 포함)에서 센 글자 칸. */
export type ViewToken = {
  key: string;
  text: string;
  col: number;
  role: ExprToken['role'] | 'head';
  path: string;
  folded: boolean;
};

/** 연산 마디 하나가 덮는 칸. `row` 는 그 마디 아래 나무의 높이(1 = 두 자식이 잎). */
export type ViewSpan = {
  path: string;
  c1: number;
  c2: number;
  opCol: number;
  row: number;
  kept: Side | null;
};

export type LineView = {
  line: number;
  tokens: ViewToken[];
  spans: ViewSpan[];
};

export const nodeKey = (line: number, path: string): string => `${line}:${path}`;

function displayExpr(e: Expr, line: number, path: string, folded: Map<string, number>): Expr {
  const v = folded.get(nodeKey(line, path));
  if (v !== undefined) return { num: v };
  if (!('op' in e)) return e;
  return {
    op: e.op,
    l: displayExpr(e.l, line, `${path}l`, folded),
    r: displayExpr(e.r, line, `${path}r`, folded),
  };
}

function height(e: Expr): number {
  return 'op' in e ? 1 + Math.max(height(e.l), height(e.r)) : 0;
}

function nodeAt(e: Expr, path: string): Expr | null {
  let cur: Expr = e;
  for (const ch of path) {
    if (!('op' in cur)) return null;
    cur = ch === 'l' ? cur.l : cur.r;
  }
  return cur;
}

function foldedMap(scene: FoldScene, omit: string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of scene.folded) {
    const key = nodeKey(f.line, f.path);
    if (key !== omit) m.set(key, f.value);
  }
  return m;
}

/** 지금 식 나무(접힌 마디는 수). `omit` 마디는 아직 접히지 않은 것으로 친다 — 걸음 직전의 모습. */
export function displayOf(scene: FoldScene, line: number, omit: string | null = null): Expr | null {
  const src = scene.lines[line - 1];
  if (src === undefined) throw new Error(`fold-at-compile: 없는 줄 L${line}`);
  const e = stmtExpr(src.stmt);
  return e === null ? null : displayExpr(e, line, '', foldedMap(scene, omit));
}

/** 한 줄의 글자 조각과 연산 칸. */
export function lineView(scene: FoldScene, line: number, omit: string | null = null): LineView {
  const src = scene.lines[line - 1];
  if (src === undefined) throw new Error(`fold-at-compile: 없는 줄 L${line}`);
  const head = stmtHead(src.stmt);
  const lead = src.indent * 4;
  const tokens: ViewToken[] = [
    { key: 'head', text: head, col: lead, role: 'head', path: '', folded: false },
  ];
  const spans: ViewSpan[] = [];
  const shown = displayOf(scene, line, omit);
  if (shown === null) return { line, tokens, spans };

  const folded = foldedMap(scene, omit);
  let col = lead + head.length;
  for (const tok of exprTokens(shown)) {
    if (tok.role === 'op') col += 1;
    tokens.push({
      key: `${tok.path}|${tok.role}`,
      text: tok.text,
      col,
      role: tok.role,
      path: tok.path,
      folded: tok.role === 'num' && folded.has(nodeKey(line, tok.path)),
    });
    col += tok.text.length + (tok.role === 'op' ? 1 : 0);
  }

  const keptBy = new Map<string, Side>();
  for (const k of scene.kept) if (k.line === line) keptBy.set(k.path, k.blocked);

  for (const opTok of tokens) {
    if (opTok.role !== 'op') continue;
    const p = opTok.path;
    const inside = tokens.filter(
      (x) => x.role !== 'head' && x.path.startsWith(p) && !(x.path === p && (x.role === 'open' || x.role === 'close')),
    );
    const node = nodeAt(shown, p);
    if (node === null) throw new Error(`fold-at-compile: L${line} 의 마디 ${p} 를 찾지 못했다`);
    spans.push({
      path: p,
      c1: Math.min(...inside.map((x) => x.col)),
      c2: Math.max(...inside.map((x) => x.col + x.text.length)),
      opCol: opTok.col,
      row: height(node),
      kept: keptBy.get(p) ?? null,
    });
  }
  return { line, tokens, spans };
}

/** 한 마디의 글자 (걸음 직전의 모습으로). */
export function nodeText(scene: FoldScene, line: number, path: string, omit: string | null): string {
  const shown = displayOf(scene, line, omit);
  const node = shown === null ? null : nodeAt(shown, path);
  if (node === null) throw new Error(`fold-at-compile: L${line} 의 마디 ${path} 를 찾지 못했다`);
  let out = '';
  for (const tok of exprTokens(node)) out += tok.role === 'op' ? ` ${tok.text} ` : tok.text;
  return out;
}

/** 실행 때 셈하는 연산 수 — 지금 식 나무에 남은 연산 마디. */
export function opsNow(scene: FoldScene): number {
  let n = 0;
  for (let line = 1; line <= scene.lines.length; line += 1) {
    const e = displayOf(scene, line);
    if (e !== null) n += countOps(e);
  }
  return n;
}

export function opsAtStart(scene: FoldScene): number {
  let n = 0;
  for (const ln of scene.lines) {
    const e = stmtExpr(ln.stmt);
    if (e !== null) n += countOps(e);
  }
  return n;
}

function readSide(v: unknown): Side {
  if (v === 'left' || v === 'right' || v === 'both') return v;
  throw new Error(`fold-at-compile: 막은 쪽이 틀렸다 ${String(v)}`);
}

function readWhere(payload: unknown, scene: FoldScene): { line: number; path: string; p: Record<string, unknown> } {
  if (typeof payload !== 'object' || payload === null) throw new Error('fold-at-compile: payload 가 없다');
  const p = payload as Record<string, unknown>;
  const line = p.line;
  const path = p.path;
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 1 || line > scene.lines.length) {
    throw new Error(`fold-at-compile: 줄 번호가 틀렸다 ${String(line)}`);
  }
  if (typeof path !== 'string' || !/^[lr]*$/.test(path)) {
    throw new Error(`fold-at-compile: 마디 길이 틀렸다 ${String(path)}`);
  }
  return { line, path, p };
}

export const foldAtCompileScene: ScenePlan<FoldScene> = {
  initial(initialData: unknown): FoldScene {
    return { lines: readProgram(initialData), folded: [], kept: [], step: null };
  },
  reduce(scene: FoldScene, event: FacetRuntimeEvent): FoldScene {
    if (event.type === 'fold') {
      const { line, path, p } = readWhere(event.payload, scene);
      const value = p.value;
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        throw new Error(`fold-at-compile: 접은 값이 정수가 아니다 ${String(value)}`);
      }
      return {
        ...scene,
        folded: [...scene.folded, { line, path, value }],
        step: { kind: 'fold', line, path, value },
      };
    }
    if (event.type === 'keep') {
      const { line, path, p } = readWhere(event.payload, scene);
      const blocked = readSide(p.blocked);
      return {
        ...scene,
        kept: [...scene.kept, { line, path, blocked }],
        step: { kind: 'keep', line, path, blocked },
      };
    }
    return scene;
  },
};

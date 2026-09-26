/**
 * type-flows-up 의 장면.
 *
 * 바탕 — 줄 목록(`lines`). initialData 에서 베낀다.
 * 자취 — 노드마다 정해진 타입(`nodeTypes`) · 이름 표(`names`).
 * 이번 걸음 — `step`.
 *
 * 식 나무의 모양(노드 번호 · 높이 · 아이 · 글자 칸)은 바탕에서 정해진다. 장면과 그림이 같은 `layoutLine` 을 부른다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { numberNodes, parseLines, type Change, type Expr, type ProgramLine, type TypeName } from './algorithm.js';

export type { Change, ProgramLine, TypeName } from './algorithm.js';

export const TYPE_NAMES: readonly TypeName[] = ['int', 'float', 'bool', 'string'];

export type Step =
  | { kind: 'leaf'; line: number; node: number; type: TypeName; source: 'literal' }
  | { kind: 'leaf'; line: number; node: number; type: TypeName; source: 'name'; name: string; from: number }
  | { kind: 'op'; line: number; node: number; type: TypeName; l: TypeName; r: TypeName; change: Change; widened: TypeName | null }
  | { kind: 'bind'; line: number; name: string; type: TypeName };

export type NameEntry = { line: number; name: string; type: TypeName };

export type TypeFlowsUpScene = {
  lines: ProgramLine[];
  nodeTypes: (TypeName | null)[][];
  names: NameEntry[];
  step: Step | null;
};

/** 줄 글자의 한 토막. col 은 들여쓰기를 넣은 글자 칸 (0 부터). node 는 그 토막이 나타내는 식 노드. */
export type Token = { text: string; col: number; role: 'kw' | 'name' | 'punct' | 'leaf' | 'op'; node: number | null };

/** 식 노드 하나. 번호는 뒤따라 돌기 차례. col 은 그 노드를 나타내는 토막의 가운데 칸. */
export type NodeShape = { leaf: boolean; label: string; height: number; kids: number[]; col: number };

export type LineLayout = { tokens: Token[]; nodes: NodeShape[]; width: number; root: number };

const PREC: Record<string, number> = {
  or: 1, and: 2, '==': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3,
  '+': 4, '-': 4, '*': 5, '/': 5, div: 5, mod: 5,
};

function leafText(e: Expr, where: string): string | null {
  if (e.k === 'int') return String(e.v);
  if (e.k === 'float') return Number.isInteger(e.v) ? e.v.toFixed(1) : String(e.v);
  if (e.k === 'bool') return e.v ? 'true' : 'false';
  if (e.k === 'string') return `"${e.v}"`;
  if (e.k === 'var') return e.name;
  if (e.k === 'op') return null;
  throw new Error(`type-flows-up: ${where} 모르는 식 ${JSON.stringify(e)}`);
}

/**
 * 줄 하나를 토막과 식 노드로 편다. 노드 번호는 알고리즘의 `numberNodes` 가 매긴 것을 그대로 쓴다.
 * 구조에서 찍은 글자가 줄의 `text` 와 다르면 던진다.
 */
export function layoutLine(line: ProgramLine, index: number): LineLayout {
  const where = `L${index + 1}`;
  if (line.stmt.k !== 'let') throw new Error(`type-flows-up: ${where} let 이 아닌 문`);
  const tokens: Token[] = [];
  const numbered = numberNodes(line.stmt.value);
  const ids = new Map<Expr, number>(numbered.map((nd, i) => [nd.expr, i]));
  const nodes: (NodeShape | undefined)[] = numbered.map(() => undefined);
  const idOf = (e: Expr): number => {
    const id = ids.get(e);
    if (id === undefined) throw new Error(`type-flows-up: ${where} 번호 없는 노드`);
    return id;
  };
  let col = line.indent * 4;
  const push = (text: string, role: Token['role'], node: number | null): Token => {
    const tok = { text, col, role, node };
    tokens.push(tok);
    col += text.length;
    return tok;
  };
  const space = (): void => {
    col += 1;
  };

  function visit(e: Expr, parent: number): number {
    const leaf = leafText(e, where);
    if (leaf !== null) {
      const id = idOf(e);
      const tok = push(leaf, 'leaf', id);
      nodes[id] = { leaf: true, label: leaf, height: 0, kids: [], col: tok.col + leaf.length / 2 };
      return id;
    }
    if (e.k !== 'op') throw new Error(`type-flows-up: ${where} 모르는 식`);
    const p = PREC[e.op];
    if (p === undefined) throw new Error(`type-flows-up: ${where} 모르는 연산자 ${e.op}`);
    const paren = p < parent;
    if (paren) push('(', 'punct', null);
    const l = visit(e.l, p);
    space();
    const opTok = push(e.op, 'op', null);
    space();
    const r = visit(e.r, p + 1);
    if (paren) push(')', 'punct', null);
    const lh = nodes[l]?.height;
    const rh = nodes[r]?.height;
    if (lh === undefined || rh === undefined) throw new Error(`type-flows-up: ${where} 아이 노드가 없다`);
    const id = idOf(e);
    opTok.node = id;
    nodes[id] = { leaf: false, label: e.op, height: Math.max(lh, rh) + 1, kids: [l, r], col: opTok.col + e.op.length / 2 };
    return id;
  }

  push('let', 'kw', null);
  space();
  push(line.stmt.name, 'name', null);
  space();
  push('=', 'punct', null);
  space();
  const root = visit(line.stmt.value, 0);

  let text = '';
  for (const tok of tokens) text = text.padEnd(tok.col - line.indent * 4, ' ') + tok.text;
  if (text !== line.text) {
    throw new Error(`type-flows-up: ${where} 글자가 구조와 다르다 ${JSON.stringify(text)} != ${JSON.stringify(line.text)}`);
  }
  const shaped = nodes.map((nd, i) => {
    if (nd === undefined) throw new Error(`type-flows-up: ${where} 노드 ${i} 를 펴지 못했다`);
    return nd;
  });
  return { tokens, nodes: shaped, width: col, root };
}

function isType(v: unknown): v is TypeName {
  return typeof v === 'string' && (TYPE_NAMES as readonly string[]).includes(v);
}

function isChange(v: unknown): v is Change {
  return v === 'keep' || v === 'widen' || v === 'turn' || v === 'concat';
}

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined;
  return (payload as Record<string, unknown>)[key];
}

function num(payload: unknown, key: string): number {
  const v = field(payload, key);
  if (typeof v !== 'number') throw new Error(`type-flows-up: payload.${key} 가 수가 아니다`);
  return v;
}

function ty(payload: unknown, key: string): TypeName {
  const v = field(payload, key);
  if (!isType(v)) throw new Error(`type-flows-up: payload.${key} 가 타입이 아니다`);
  return v;
}

function str(payload: unknown, key: string): string {
  const v = field(payload, key);
  if (typeof v !== 'string') throw new Error(`type-flows-up: payload.${key} 가 글자가 아니다`);
  return v;
}

function withType(scene: TypeFlowsUpScene, line: number, node: number, type: TypeName): (TypeName | null)[][] {
  const row = scene.nodeTypes[line];
  if (row === undefined || node < 0 || node >= row.length) {
    throw new Error(`type-flows-up: L${line + 1} 노드 ${node} 가 나무에 없다`);
  }
  return scene.nodeTypes.map((r, i) => (i === line ? r.map((t, j) => (j === node ? type : t)) : r));
}

export const typeFlowsUpScene: ScenePlan<TypeFlowsUpScene> = {
  initial(initialData: unknown): TypeFlowsUpScene {
    const lines = parseLines(field(initialData, 'lines'));
    const nodeTypes = lines.map((line, i) => layoutLine(line, i).nodes.map(() => null));
    return { lines, nodeTypes, names: [], step: null };
  },
  reduce(scene: TypeFlowsUpScene, event: FacetRuntimeEvent): TypeFlowsUpScene {
    const p = event.payload;
    if (event.type === 'leaf') {
      const line = num(p, 'line');
      const node = num(p, 'node');
      const type = ty(p, 'type');
      const source = field(p, 'source');
      const nodeTypes = withType(scene, line, node, type);
      if (source === 'literal') {
        return { ...scene, nodeTypes, step: { kind: 'leaf', line, node, type, source } };
      }
      if (source === 'name') {
        const step: Step = { kind: 'leaf', line, node, type, source, name: str(p, 'name'), from: num(p, 'from') };
        return { ...scene, nodeTypes, step };
      }
      throw new Error('type-flows-up: 모르는 잎 출처');
    }
    if (event.type === 'op') {
      const line = num(p, 'line');
      const node = num(p, 'node');
      const type = ty(p, 'type');
      const change = field(p, 'change');
      if (!isChange(change)) throw new Error('type-flows-up: payload.change 가 없다');
      const w = field(p, 'widened');
      if (w !== null && !isType(w)) throw new Error('type-flows-up: payload.widened 가 타입도 null 도 아니다');
      if ((change === 'widen') !== (w !== null)) throw new Error('type-flows-up: widened 와 change 가 어긋난다');
      const step: Step = { kind: 'op', line, node, type, l: ty(p, 'l'), r: ty(p, 'r'), change, widened: w };
      return { ...scene, nodeTypes: withType(scene, line, node, type), step };
    }
    if (event.type === 'bind') {
      const line = num(p, 'line');
      const name = str(p, 'name');
      const type = ty(p, 'type');
      return { ...scene, names: [...scene.names, { line, name, type }], step: { kind: 'bind', line, name, type } };
    }
    return scene;
  },
};

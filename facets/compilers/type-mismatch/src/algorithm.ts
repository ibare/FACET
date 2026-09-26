/**
 * type-mismatch — 검사기가 줄마다 들어오는 타입을 자리에 끼워 보다 한 자리에서 걸린다.
 *
 * 검사기는 원시 프로그램을 위에서 아래로 한 번 읽는다. 값을 셈하지 않는다.
 * 줄마다 식의 타입을 뒤따라 돌며(왼쪽 → 오른쪽 → 자기) 규칙표로 셈하고, `let` 이면
 * 그 타입을 선언한 자리에 끼운다. 규칙이 없는 짝을 만난 연산 노드가 **걸린 자리**다.
 * 걸린 노드 위는 타입이 없으므로 맞춰 보지 않는다. 걸린 줄의 이름도 선언한 타입으로
 * 표에 오른다. 검사는 끝 줄까지 가고, 마지막에 판정이 한 번 온다.
 *
 * 이벤트 (전부 silent 아님 — 걸음이다):
 *
 *   line-checked  줄 하나를 검사한 결과
 *     payload: {
 *       line: number                      // 0 부터
 *       nodes: Array<{
 *         from: number; to: number        // 줄 글자 안의 자리 [from, to)
 *         op: string | null               // 연산 노드면 연산자, 잎이면 null
 *         symFrom: number | null          // 연산자 글자의 시작 자리
 *         l: number | null; r: number | null  // 자식 노드 번호
 *         parent: number | null
 *         type: string | null             // 셈한 타입. 걸렸거나 맞춰 보지 않았으면 null
 *         state: 'typed' | 'snag' | 'untried'
 *       }>
 *       root: number
 *       slot: { kind: 'let'; name: string; declared: string; from: number; to: number }
 *           | { kind: 'show'; from: number; to: number }
 *       outcome: 'fit' | 'widen' | 'slot-miss' | 'snag'
 *       got: string | null                // 뿌리의 타입 (걸렸으면 null)
 *     }
 *
 *   verdict       모든 줄 뒤의 판정
 *     payload: { snags: number; rejected: boolean; ran: number }   // ran 은 실행한 줄 — 늘 0
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TypeName = 'int' | 'float' | 'bool' | 'string';

export type Expr =
  | { k: 'int'; v: number }
  | { k: 'float'; v: number }
  | { k: 'bool'; v: boolean }
  | { k: 'string'; v: string }
  | { k: 'var'; name: string }
  | { k: 'op'; op: string; l: Expr; r: Expr };

export type Stmt =
  | { k: 'let'; name: string; type: TypeName; value: Expr }
  | { k: 'show'; value: Expr };

export type SourceLine = { indent: number; text: string; stmt: Stmt };

export type TypeMismatchFacetData = {
  type: 'type-mismatch';
  stepMs: number;
  lines: SourceLine[];
};

export type NodeState = 'typed' | 'snag' | 'untried';

export type CheckNode = {
  from: number;
  to: number;
  op: string | null;
  symFrom: number | null;
  l: number | null;
  r: number | null;
  parent: number | null;
  type: TypeName | null;
  state: NodeState;
};

const PREC: Record<string, number> = {
  or: 1, and: 2, '==': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3,
  '+': 4, '-': 4, '*': 5, '/': 5, div: 5, mod: 5,
};

const NUM: readonly TypeName[] = ['int', 'float'];
const isNum = (x: TypeName): boolean => NUM.includes(x);

/** 규칙표 (common.md). 맞는 규칙이 없으면 null — 맞물리지 않는다. */
function rule(op: string, lt: TypeName, rt: TypeName, line: number): TypeName | null {
  switch (op) {
    case '+':
    case '-':
    case '*':
      if (op === '+' && (lt === 'string' || rt === 'string')) return 'string';
      if (isNum(lt) && isNum(rt)) return lt === 'int' && rt === 'int' ? 'int' : 'float';
      return null;
    case '/':
      return isNum(lt) && isNum(rt) ? 'float' : null;
    case 'div':
    case 'mod':
      return lt === 'int' && rt === 'int' ? 'int' : null;
    case '<':
    case '<=':
    case '>':
    case '>=':
      return isNum(lt) && isNum(rt) ? 'bool' : null;
    case '==':
    case '!=':
      return lt === rt || (isNum(lt) && isNum(rt)) ? 'bool' : null;
    case 'and':
    case 'or':
      return lt === 'bool' && rt === 'bool' ? 'bool' : null;
    default:
      throw new Error(`type-mismatch: 줄 ${line + 1} — 모르는 연산자 ${op}`);
  }
}

/** `let x: T = 식` 의 자리 맞춤. 같거나 int 가 float 자리로 넓혀질 때만. */
function fitsSlot(declared: TypeName, got: TypeName): boolean {
  return declared === got || (declared === 'float' && got === 'int');
}

function literalText(e: Expr, line: number): string {
  switch (e.k) {
    case 'int':
      return String(e.v);
    case 'float':
      return Number.isInteger(e.v) ? e.v.toFixed(1) : String(e.v);
    case 'bool':
      return e.v ? 'true' : 'false';
    case 'string':
      return `"${e.v}"`;
    case 'var':
      return e.name;
    default:
      throw new Error(`type-mismatch: 줄 ${line + 1} — 잎이 아닌 식을 잎으로 찍으려 했다`);
  }
}

type Built = { text: string; node: number };

/** 식을 글자로 찍으며 노드마다 글자 자리를 적는다. 괄호는 차례가 요구할 때만. */
function build(
  e: Expr,
  parentPrec: number,
  offset: number,
  nodes: CheckNode[],
  exprs: Expr[],
  line: number,
): Built {
  if (e.k === 'op') {
    const p = PREC[e.op];
    if (p === undefined) throw new Error(`type-mismatch: 줄 ${line + 1} — 모르는 연산자 ${e.op}`);
    const paren = p < parentPrec;
    const start = offset + (paren ? 1 : 0);
    const me = nodes.length;
    nodes.push({ from: start, to: start, op: e.op, symFrom: null, l: null, r: null, parent: null, type: null, state: 'untried' });
    exprs.push(e);
    const left = build(e.l, p, start, nodes, exprs, line);
    const symFrom = start + left.text.length + 1;
    const right = build(e.r, p + 1, symFrom + e.op.length + 1, nodes, exprs, line);
    const inner = `${left.text} ${e.op} ${right.text}`;
    const self = nodes[me];
    if (self === undefined) throw new Error(`type-mismatch: 줄 ${line + 1} — 노드 ${me} 가 없다`);
    self.to = start + inner.length;
    self.symFrom = symFrom;
    self.l = left.node;
    self.r = right.node;
    const ln = nodes[left.node];
    const rn = nodes[right.node];
    if (ln === undefined || rn === undefined) throw new Error(`type-mismatch: 줄 ${line + 1} — 자식 노드가 없다`);
    ln.parent = me;
    rn.parent = me;
    return { text: paren ? `(${inner})` : inner, node: me };
  }
  const text = literalText(e, line);
  const me = nodes.length;
  nodes.push({ from: offset, to: offset + text.length, op: null, symFrom: null, l: null, r: null, parent: null, type: null, state: 'untried' });
  exprs.push(e);
  return { text, node: me };
}

class Snag extends Error {
  constructor(readonly node: number) {
    super('snag');
  }
}

/** 뒤따라 돌기 — 왼쪽 → 오른쪽 → 자기. 규칙이 없는 노드에서 Snag 를 던진다. */
function walk(
  i: number,
  nodes: CheckNode[],
  exprs: Expr[],
  env: Map<string, TypeName>,
  line: number,
): TypeName {
  const n = nodes[i];
  const e = exprs[i];
  if (n === undefined || e === undefined) throw new Error(`type-mismatch: 줄 ${line + 1} — 노드 ${i} 가 없다`);
  if (e.k === 'op') {
    if (n.l === null || n.r === null) throw new Error(`type-mismatch: 줄 ${line + 1} — 연산 노드에 자식이 없다`);
    const lt = walk(n.l, nodes, exprs, env, line);
    const rt = walk(n.r, nodes, exprs, env, line);
    const res = rule(e.op, lt, rt, line);
    if (res === null) {
      n.state = 'snag';
      throw new Snag(i);
    }
    n.type = res;
    n.state = 'typed';
    return res;
  }
  if (e.k === 'var') {
    const ty = env.get(e.name);
    if (ty === undefined) throw new Error(`type-mismatch: 줄 ${line + 1} — 선언 없는 이름 ${e.name}`);
    n.type = ty;
    n.state = 'typed';
    return ty;
  }
  n.type = e.k;
  n.state = 'typed';
  return e.k;
}

export async function typeMismatch(context: FacetContext<TypeMismatchFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<TypeMismatchFacetData>;
  const { lines, stepMs } = ctx.data;
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('type-mismatch: 줄 목록이 비었다');
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('type-mismatch: stepMs 가 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const env = new Map<string, TypeName>();
  let snags = 0;

  for (let li = 0; li < lines.length; li += 1) {
    // 걸음 0 이 이미 프로그램 전체라 첫 발신 앞에도 읽을 틈을 둔다.
    if (!(await pause())) return;
    const src = lines[li];
    if (src === undefined) throw new Error(`type-mismatch: 줄 ${li + 1} 이 없다`);
    const st = src.stmt;
    const nodes: CheckNode[] = [];
    const exprs: Expr[] = [];
    let head: string;
    if (st.k === 'let') {
      head = `let ${st.name}: ${st.type} = `;
    } else if (st.k === 'show') {
      head = 'show ';
    } else {
      throw new Error(`type-mismatch: 줄 ${li + 1} — 모르는 문`);
    }
    const built = build(st.value, 0, head.length, nodes, exprs, li);
    if (head + built.text !== src.text) {
      throw new Error(`type-mismatch: 줄 ${li + 1} — 글자가 구조와 다르다: ${JSON.stringify(src.text)} ≠ ${JSON.stringify(head + built.text)}`);
    }

    let got: TypeName | null = null;
    try {
      got = walk(built.node, nodes, exprs, env, li);
    } catch (e) {
      if (!(e instanceof Snag)) throw e;
    }

    if (st.k === 'let') {
      const from = `let ${st.name}: `.length;
      const slot = { kind: 'let' as const, name: st.name, declared: st.type, from, to: from + st.type.length };
      let outcome: 'fit' | 'widen' | 'slot-miss' | 'snag';
      if (got === null) outcome = 'snag';
      else if (!fitsSlot(st.type, got)) outcome = 'slot-miss';
      else outcome = got === st.type ? 'fit' : 'widen';
      if (outcome === 'snag' || outcome === 'slot-miss') snags += 1;
      // 걸린 줄의 이름도 선언한 타입으로 표에 오른다 — 뒤 줄이 덩달아 걸리지 않게.
      env.set(st.name, st.type);
      await ctx.emit({ type: 'line-checked', payload: { line: li, nodes, root: built.node, slot, outcome, got } });
    } else {
      const slot = { kind: 'show' as const, from: 0, to: 'show'.length };
      const outcome = got === null ? 'snag' : 'fit';
      if (got === null) snags += 1;
      await ctx.emit({ type: 'line-checked', payload: { line: li, nodes, root: built.node, slot, outcome, got } });
    }
  }

  if (!(await pause())) return;
  // 검사는 실행이 아니다 — 어느 걸음에서도 실행한 줄은 없다.
  const ran = 0;
  await ctx.emit({ type: 'verdict', payload: { snags, rejected: snags > 0, ran } });
}

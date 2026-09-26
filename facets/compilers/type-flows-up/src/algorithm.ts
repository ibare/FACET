/**
 * type-flows-up — 타입을 적지 않은 `let` 의 식에서 타입이 잎에서 뿌리로 오르고, 뿌리의 타입이 이름에 붙는다.
 *
 * 컴파일러는 줄을 위에서 아래로 한 번 읽는다. 한 줄의 식은 뒤따라 돌기(왼쪽 아이 → 오른쪽 아이 → 자기)로
 * 노드마다 타입을 정한다. 값은 셈하지 않는다 — 정해지는 것은 타입뿐이다.
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음이다. 걸음마다 앞에 stepMs 를 둔다. 걸음 0 이 프로그램 전체라서다):
 *   leaf  { line: number, node: number, type: TypeName, source: 'literal' }
 *         { line: number, node: number, type: TypeName, source: 'name', name: string, from: number }
 *           값 글자 · 이름 잎의 타입이 정해졌다. from = 그 이름이 타입을 얻은 줄 (0 부터)
 *   op    { line: number, node: number, type: TypeName, l: TypeName, r: TypeName, change: Change, widened: TypeName | null }
 *           연산 노드가 두 아이의 타입을 규칙으로 합쳤다.
 *           change: 'keep'(두 아이와 같다) · 'widen'(int 가 float 로 넓혀졌다) · 'turn'(어느 아이에도 없던 타입) ·
 *                   'concat'(한쪽이 string 이라 글자 잇기)
 *           widened: change 가 'widen' 일 때 넓혀진 쪽의 타입, 아니면 null
 *   bind  { line: number, name: string, type: TypeName }
 *           뿌리의 타입이 `let` 의 이름으로 올라가 이름 표에 적혔다
 *
 * node = `numberNodes` 가 매긴 뒤따라 돌기 번호 (0 부터). 장면 · 그림도 같은 함수로 번호를 얻는다.
 * 줄 자료는 `parseLines` 가 줄마다 좁혀 새로 만든다 — 알고리즘과 장면의 initial 이 함께 부른다.
 * 타입 규칙은 공통 안내문의 표 그대로다. 맞는 규칙이 없거나 모르는 모양 · 선언 없는 이름이면 줄 번호를 담아 던진다 (C6).
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

/** 이 조각의 줄은 타입을 적지 않은 `let` 뿐이다 — 적지 않은 것이 전제다. */
export type LetStmt = { k: 'let'; name: string; value: Expr };

export type ProgramLine = { indent: number; text: string; stmt: LetStmt };

export type TypeFlowsUpFacetData = {
  type: 'type-flows-up';
  stepMs: number;
  lines: ProgramLine[];
};

export type Change = 'keep' | 'widen' | 'turn' | 'concat';

/** 뒤따라 돌기 차례로 번호 매긴 노드. kids 는 아이 노드의 번호. */
export type NumberedNode = { expr: Expr; kids: number[] };

const NUM: readonly TypeName[] = ['int', 'float'];

// ─── 자료 좁히기 ─────────────────────────────────────────────────────────

function rec(v: unknown, what: string, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`type-flows-up: ${where} ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function parseExpr(v: unknown, where: string): Expr {
  const o = rec(v, '식', where);
  const k = o['k'];
  if (k === 'int' || k === 'float') {
    const n = o['v'];
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`type-flows-up: ${where} ${k} 값이 수가 아니다`);
    if (k === 'int' && !Number.isInteger(n)) throw new Error(`type-flows-up: ${where} int 값이 정수가 아니다`);
    return { k, v: n };
  }
  if (k === 'bool') {
    const b = o['v'];
    if (typeof b !== 'boolean') throw new Error(`type-flows-up: ${where} bool 값이 참 · 거짓이 아니다`);
    return { k, v: b };
  }
  if (k === 'string') {
    const s = o['v'];
    if (typeof s !== 'string') throw new Error(`type-flows-up: ${where} string 값이 글자가 아니다`);
    return { k, v: s };
  }
  if (k === 'var') {
    const name = o['name'];
    if (typeof name !== 'string' || name === '') throw new Error(`type-flows-up: ${where} 이름이 없다`);
    return { k, name };
  }
  if (k === 'op') {
    const op = o['op'];
    if (typeof op !== 'string') throw new Error(`type-flows-up: ${where} 연산자가 없다`);
    return { k, op, l: parseExpr(o['l'], where), r: parseExpr(o['r'], where) };
  }
  throw new Error(`type-flows-up: ${where} 모르는 식 ${JSON.stringify(k)}`);
}

/** initialData.lines 를 줄마다 좁혀 새 값으로 만든다. 모르는 모양은 줄 번호를 담아 던진다. */
export function parseLines(raw: unknown): ProgramLine[] {
  if (!Array.isArray(raw)) throw new Error('type-flows-up: lines 가 배열이 아니다');
  return raw.map((item: unknown, i): ProgramLine => {
    const where = `L${i + 1}`;
    const o = rec(item, '줄', where);
    const indent = o['indent'];
    if (typeof indent !== 'number' || !Number.isInteger(indent) || indent < 0) {
      throw new Error(`type-flows-up: ${where} indent 가 0 이상의 정수가 아니다`);
    }
    const text = o['text'];
    if (typeof text !== 'string') throw new Error(`type-flows-up: ${where} text 가 글자가 아니다`);
    const st = rec(o['stmt'], '문', where);
    if (st['k'] !== 'let') throw new Error(`type-flows-up: ${where} let 이 아닌 문 ${JSON.stringify(st['k'])}`);
    if (st['type'] !== undefined) throw new Error(`type-flows-up: ${where} 타입이 적혀 있다`);
    const name = st['name'];
    if (typeof name !== 'string' || name === '') throw new Error(`type-flows-up: ${where} let 의 이름이 없다`);
    return { indent, text, stmt: { k: 'let', name, value: parseExpr(st['value'], where) } };
  });
}

/** 식의 노드를 뒤따라 돌기 차례로 번호 매긴다. 번호는 이 함수 한 곳에서만 정한다. */
export function numberNodes(e: Expr): NumberedNode[] {
  const out: NumberedNode[] = [];
  const visit = (x: Expr): number => {
    const kids = x.k === 'op' ? [visit(x.l), visit(x.r)] : [];
    out.push({ expr: x, kids });
    return out.length - 1;
  };
  visit(e);
  return out;
}

// ─── 타입 규칙 ──────────────────────────────────────────────────────────

/** 타입 규칙표. 맞는 규칙이 없으면 null. 표에 없는 연산자는 던진다. */
function rule(op: string, lt: TypeName, rt: TypeName, where: string): TypeName | null {
  const num = NUM.includes(lt) && NUM.includes(rt);
  if (op === '+' || op === '-' || op === '*') {
    if (op === '+' && (lt === 'string' || rt === 'string')) return 'string';
    if (!num) return null;
    return lt === 'int' && rt === 'int' ? 'int' : 'float';
  }
  if (op === '/') return num ? 'float' : null;
  if (op === 'div' || op === 'mod') return lt === 'int' && rt === 'int' ? 'int' : null;
  if (op === '<' || op === '<=' || op === '>' || op === '>=') return num ? 'bool' : null;
  if (op === '==' || op === '!=') return lt === rt || num ? 'bool' : null;
  if (op === 'and' || op === 'or') return lt === 'bool' && rt === 'bool' ? 'bool' : null;
  throw new Error(`type-flows-up: ${where} 모르는 연산자 ${op}`);
}

function classify(lt: TypeName, rt: TypeName, res: TypeName): { change: Change; widened: TypeName | null } {
  if (lt === res && rt === res) return { change: 'keep', widened: null };
  if (lt !== res && rt !== res) return { change: 'turn', widened: null };
  if (res === 'float' && (lt === 'int' || rt === 'int')) return { change: 'widen', widened: 'int' };
  if (res === 'string') return { change: 'concat', widened: null };
  throw new Error(`type-flows-up: 분류할 수 없는 합침 ${lt}, ${rt} → ${res}`);
}

export async function typeFlowsUp(context: FacetContext<TypeFlowsUpFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<TypeFlowsUpFacetData>;
  const { stepMs } = ctx.data;
  const lines = parseLines(ctx.data.lines);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  /** 이름 → (타입, 그 타입을 얻은 줄). 앞 줄들이 올려 둔 것. */
  const table = new Map<string, { type: TypeName; line: number }>();

  for (let line = 0; line < lines.length; line += 1) {
    if (ctx.cancelled) return;
    const where = `L${line + 1}`;
    const src = lines[line];
    if (src === undefined) throw new Error(`type-flows-up: ${where} 줄이 없다`);
    if (table.has(src.stmt.name)) throw new Error(`type-flows-up: ${where} 같은 이름을 두 번 선언 ${src.stmt.name}`);

    const nodes = numberNodes(src.stmt.value);
    const types: TypeName[] = [];
    for (let node = 0; node < nodes.length; node += 1) {
      if (!(await pause())) return;
      const nd = nodes[node];
      if (nd === undefined) throw new Error(`type-flows-up: ${where} 노드 ${node} 가 없다`);
      const e = nd.expr;
      if (e.k === 'var') {
        const hit = table.get(e.name);
        if (hit === undefined) throw new Error(`type-flows-up: ${where} 선언 없는 이름 ${e.name}`);
        types.push(hit.type);
        await ctx.emit({
          type: 'leaf',
          payload: { line, node, type: hit.type, source: 'name', name: e.name, from: hit.line },
        });
      } else if (e.k === 'op') {
        const [li, ri] = nd.kids;
        const lt = li === undefined ? undefined : types[li];
        const rt = ri === undefined ? undefined : types[ri];
        if (lt === undefined || rt === undefined) throw new Error(`type-flows-up: ${where} 노드 ${node} 의 아이 타입이 없다`);
        const res = rule(e.op, lt, rt, where);
        if (res === null) throw new Error(`type-flows-up: ${where} 맞물리지 않는다 ${lt} ${e.op} ${rt}`);
        const { change, widened } = classify(lt, rt, res);
        types.push(res);
        await ctx.emit({ type: 'op', payload: { line, node, type: res, l: lt, r: rt, change, widened } });
      } else {
        types.push(e.k);
        await ctx.emit({ type: 'leaf', payload: { line, node, type: e.k, source: 'literal' } });
      }
    }

    const ty = types[types.length - 1];
    if (ty === undefined) throw new Error(`type-flows-up: ${where} 뿌리의 타입이 없다`);
    if (!(await pause())) return;
    table.set(src.stmt.name, { type: ty, line });
    await ctx.emit({ type: 'bind', payload: { line, name: src.stmt.name, type: ty } });
  }
}

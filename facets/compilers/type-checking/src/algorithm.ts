/**
 * type-checking — 같은 일곱 줄을 규칙표가 다른 세 언어가 검사한다.
 *
 * 컴파일러는 글을 위에서 아래로 한 번 읽는다. 값을 셈하지 않고 줄마다 식의 타입을 잎에서 뿌리로
 * 올린다(뒤차례 — 왼쪽 · 오른쪽 · 자기). 규칙표(opRule)에 없는 짝을 만나면 오름이 거기서 멈추고
 * 그 자리를 하나 센다. 걸린 마디 위는 타입이 없어(-1) 세지 않고, 타입 없는 이름을 읽는 식도 세지
 * 않는다 — 한 자리만 짚는다. `let x: T = 식` 은 x 에 T 를 먼저 두고, 식의 타입이 있으면 자리
 * 표(fits)에 끼워 본다.
 *
 * 손잡이 `rule` 이 바꾸는 것은 두 표뿐이다. 표는 손으로 적지 않고 규칙의 두 깃발(widen ·
 * boolAsInt)에서 짓는다 (`buildTables`).
 *
 * ── 이벤트 (모두 facet 고유)
 *   phase    { phase: string }                                   silent — 코드 패널 줄
 *   round    { rule, ruleId, opCells, opAll, fitCells, fitAll,
 *              lines: [{ lineNo, text, name, want: string|null,
 *                        nodes: [{ id, text, kind: 'lit'|'var'|'op', parent, side: 'left'|'right'|null }] }] }
 *                                                                걸음 0 — 새 회차
 *   rise     { line, lineNo, expr, outcome: 'rise'|'op-miss'|'unknown',
 *              leaves: [{ node, type, typed }],
 *              ops: [{ node, l, r, op, result, typed, outcome }],   뒤차례
 *              missNode: number (-1 = 없음), errors, untyped }     걸음 (가) — 연산이 있는 줄만
 *   settle   { line, lineNo, mode: 'bind'|'decl-take'|'decl-fit'|'decl-miss', expr, name,
 *              type, typed, want: string|null, mark: 0|1|2|3,
 *              leaf: { node, type, typed } | null (잎 하나인 줄), errors, untyped }
 *                                                                걸음 (나) · 잎 하나인 줄의 한 걸음
 *   verdict  { errors, untyped, rejected, where: number[] (걸린 줄 번호, 1 부터),
 *              byRule: [{ ruleId, errors, rejected }] (사다리 차례 — 세 규칙의 판정을 나란히) }
 *                                                                판정 걸음
 *   타입 글자 `type` 은 타입 이름(자료 — 번역하지 않는다), 타입이 없으면 `?` 이고 `typed` 가 거짓.
 *
 * ── phase 어휘 (irs.ts 와 같다) — 걸음 하나에 phase 하나
 *   rise · op-miss · unknown        (가) 오름의 끝 — 뿌리의 결과
 *   bind · decl-take · decl-fit · decl-miss   (나) 자리
 *   verdict                         판정
 *
 * ── 계기
 *   type-errors     걸린 자리 수 (연산 걸림 + 선언 걸림)
 *   untyped-names   타입 없이 남은 이름 수 (적지 않은 이름이 타입을 얻지 못한 것)
 *   회차마다 지금 값을 들고 차이만 보낸다. 첫 회차는 0 이어도 보낸다.
 *
 * ── 동률 · 순서
 *   동률 규칙이 없다 — 셈에 견주기가 없다. 한 줄 안의 차례는 뒤차례(왼쪽 먼저) 하나다.
 *
 * ── 줄 표지
 *   0 맞음 · 1 연산 걸림 · 2 선언 걸림 · 3 타입 없음 (앞에서 걸린 이름을 읽어 세지 않음)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TcOp = '+' | '-' | '*' | '>';

/** 식 — 나무 모양이 곧 연산의 차례다 (괄호는 데이터에 없다). */
export type TcExpr =
  | { int: number }
  | { float: number }
  | { var: string }
  | { op: TcOp; l: TcExpr; r: TcExpr };

export type TcLine = {
  indent: number;
  text: string;
  stmt: { k: 'let'; name: string; type?: string; value: TcExpr };
};

export type TcRule = { id: string; widen: boolean; boolAsInt: boolean };

export type TypeCheckingData = {
  type: 'type-checking';
  stepMs: number;
  /** 타입 번호 차례 — 번호가 곧 표의 색인 */
  types: string[];
  /** 연산자 번호 차례 */
  ops: TcOp[];
  rules: TcRule[];
  ruleLadder: number[];
  /** 처음 회차의 규칙 (사다리 값) */
  rule: number;
  lines: TcLine[];
};

export type TcTables = { opRule: number[]; fits: number[] };

export type TcNodeKind = 'lit' | 'var' | 'op';

export type TcNodeView = {
  id: number;
  text: string;
  kind: TcNodeKind;
  parent: number;
  side: 'left' | 'right' | null;
};

export type TcLineView = {
  lineNo: number;
  text: string;
  name: string;
  want: string | null;
  nodes: TcNodeView[];
};

export type TcLeafType = { node: number; type: number };

export type TcOpStep = {
  node: number;
  op: TcOp;
  l: number;
  r: number;
  result: number;
  outcome: 'rise' | 'op-miss' | 'unknown';
};

export type TcSettleMode = 'bind' | 'decl-take' | 'decl-fit' | 'decl-miss';

export type TcLineCheck = {
  /** 잎의 타입 (전위 번호 · 읽은 차례) */
  leaves: TcLeafType[];
  /** 연산 마디의 오름 (뒤차례) */
  ops: TcOpStep[];
  rootType: number;
  /** 이 줄에서 연산이 걸렸나 (걸린 마디의 줄 안 번호, 없으면 -1) */
  missNode: number;
  settle: TcSettleMode;
  want: number;
  mark: 0 | 1 | 2 | 3;
};

export type TcCheck = {
  lines: TcLineCheck[];
  errors: number;
  untyped: number;
  /** 줄 차례의 이름 → 끝의 타입 번호 (-1 = 없음) */
  nameTypes: number[];
};

// ─────────────────────────────── 표 짓기

function typeIndex(types: string[], name: string): number {
  const i = types.indexOf(name);
  if (i < 0) throw new Error(`타입 목록에 ${name} 가 없다`);
  return i;
}

/** 규칙의 두 깃발에서 두 표를 짓는다. opRule[(op*4+l)*4+r] = 결과 타입 또는 -1, fits[have*4+want] = 0/1. */
export function buildTables(rule: TcRule, types: string[], ops: TcOp[]): TcTables {
  const n = types.length;
  const INT = typeIndex(types, 'int');
  const FLOAT = typeIndex(types, 'float');
  const BOOL = typeIndex(types, 'bool');
  const STR = typeIndex(types, 'string');
  const isNum = (x: number): boolean => x === INT || x === FLOAT;
  const opRule: number[] = [];
  for (const op of ops) {
    for (let l = 0; l < n; l += 1) {
      for (let r = 0; r < n; r += 1) {
        const a = rule.boolAsInt && l === BOOL ? INT : l;
        const b = rule.boolAsInt && r === BOOL ? INT : r;
        let res = -1;
        if (op === '+' && (a === STR || b === STR)) {
          if (a === STR && b === STR) res = STR;
          else if (rule.widen) res = STR;
        } else if (op === '+' || op === '-' || op === '*') {
          if (isNum(a) && isNum(b)) {
            if (a === b) res = a;
            else if (rule.widen) res = FLOAT;
          }
        } else if (op === '>') {
          if (isNum(a) && isNum(b) && (a === b || rule.widen)) res = BOOL;
        } else {
          throw new Error(`모르는 연산자 ${String(op)}`);
        }
        opRule.push(res);
      }
    }
  }
  const fits: number[] = [];
  for (let have = 0; have < n; have += 1) {
    for (let want = 0; want < n; want += 1) {
      const ok =
        have === want ||
        (rule.widen && have === INT && want === FLOAT) ||
        (rule.boolAsInt && have === BOOL && want === INT);
      fits.push(ok ? 1 : 0);
    }
  }
  return { opRule, fits };
}

/** 표에서 규칙이 있는 칸 · 들어가는 칸을 센다 (화면 머리의 수). */
export function countCells(tables: TcTables): { opCells: number; fitCells: number } {
  return {
    opCells: tables.opRule.filter((x) => x >= 0).length,
    fitCells: tables.fits.filter((x) => x === 1).length,
  };
}

// ─────────────────────────────── 찍개 — 화면 글자는 구조에서

export function exprText(e: TcExpr): string {
  if ('int' in e) return String(e.int);
  if ('float' in e) return String(e.float);
  if ('var' in e) return e.var;
  if ('op' in e) return `${exprText(e.l)} ${e.op} ${exprText(e.r)}`;
  throw new Error('모르는 식 모양');
}

export function lineText(line: TcLine): string {
  const s = line.stmt;
  if (s.k !== 'let') throw new Error(`이 facet 은 let 만 다룬다 — ${String(s.k)}`);
  const head = s.type === undefined ? s.name : `${s.name}: ${s.type}`;
  return `${' '.repeat(line.indent * 4)}let ${head} = ${exprText(s.value)}`;
}

/** 줄 하나의 마디 — 전위 차례 0 부터 (줄 안 번호). */
export function lineNodes(e: TcExpr): TcNodeView[] {
  const out: TcNodeView[] = [];
  const walk = (x: TcExpr, parent: number, side: 'left' | 'right' | null): void => {
    const id = out.length;
    if ('op' in x) {
      out.push({ id, text: x.op, kind: 'op', parent, side });
      walk(x.l, id, 'left');
      walk(x.r, id, 'right');
    } else if ('var' in x) {
      out.push({ id, text: x.var, kind: 'var', parent, side });
    } else {
      out.push({ id, text: exprText(x), kind: 'lit', parent, side });
    }
  };
  walk(e, -1, null);
  return out;
}

export function lineViews(data: TypeCheckingData): TcLineView[] {
  return data.lines.map((ln, i) => ({
    lineNo: i + 1,
    text: ln.text,
    name: ln.stmt.name,
    want: ln.stmt.type ?? null,
    nodes: lineNodes(ln.stmt.value),
  }));
}

// ─────────────────────────────── 검사 — 줄마다, 식 나무를 따라

/**
 * 알고리즘의 길: 식 구조를 그대로 타고 오른다. 이름의 타입은 이름표(Map)에서 읽는다.
 * IR 은 같은 셈을 색인 배열로 한다 — 검수가 모든 규칙에서 답이 같은지 본다.
 */
export function checkProgram(data: TypeCheckingData, ruleValue: number): TcCheck {
  const rule = data.rules[ruleValue];
  if (rule === undefined) throw new Error(`규칙 ${ruleValue} 가 없다`);
  const { opRule, fits } = buildTables(rule, data.types, data.ops);
  const n = data.types.length;
  const env = new Map<string, number>();
  const lines: TcLineCheck[] = [];
  let errors = 0;

  for (const ln of data.lines) {
    const leaves: TcLeafType[] = [];
    const ops: TcOpStep[] = [];
    let missNode = -1;
    let nextId = 0;
    const typeOf = (e: TcExpr): number => {
      const id = nextId;
      nextId += 1;
      if ('int' in e) {
        const ty = typeIndex(data.types, 'int');
        leaves.push({ node: id, type: ty });
        return ty;
      }
      if ('float' in e) {
        const ty = typeIndex(data.types, 'float');
        leaves.push({ node: id, type: ty });
        return ty;
      }
      if ('var' in e) {
        const ty = env.get(e.var);
        if (ty === undefined) throw new Error(`${e.var} 를 읽는데 앞 줄에 선언이 없다`);
        leaves.push({ node: id, type: ty });
        return ty;
      }
      const l = typeOf(e.l);
      const r = typeOf(e.r);
      if (l < 0 || r < 0) {
        ops.push({ node: id, op: e.op, l, r, result: -1, outcome: 'unknown' });
        return -1;
      }
      const opIdx = data.ops.indexOf(e.op);
      if (opIdx < 0) throw new Error(`연산자 목록에 ${e.op} 가 없다`);
      const res = opRule[(opIdx * n + l) * n + r];
      if (res === undefined) throw new Error('규칙표 칸 밖');
      if (res < 0) {
        errors += 1;
        missNode = id;
        ops.push({ node: id, op: e.op, l, r, result: -1, outcome: 'op-miss' });
        return -1;
      }
      ops.push({ node: id, op: e.op, l, r, result: res, outcome: 'rise' });
      return res;
    };
    const ty = typeOf(ln.stmt.value);
    const declared = ln.stmt.type;
    let settle: TcSettleMode;
    let mark: 0 | 1 | 2 | 3;
    let want = -1;
    if (declared === undefined) {
      env.set(ln.stmt.name, ty);
      settle = 'bind';
      mark = ty >= 0 ? 0 : missNode >= 0 ? 1 : 3;
    } else {
      want = typeIndex(data.types, declared);
      env.set(ln.stmt.name, want);
      if (ty < 0) {
        settle = 'decl-take';
        mark = missNode >= 0 ? 1 : 3;
      } else if (fits[ty * n + want] === 1) {
        settle = 'decl-fit';
        mark = 0;
      } else {
        errors += 1;
        settle = 'decl-miss';
        mark = 2;
      }
    }
    lines.push({ leaves, ops, rootType: ty, missNode, settle, want, mark });
  }

  const nameTypes = data.lines.map((ln) => {
    const ty = env.get(ln.stmt.name);
    if (ty === undefined) throw new Error(`${ln.stmt.name} 의 타입이 없다`);
    return ty;
  });
  const untyped = lines.filter((c) => c.settle === 'bind' && c.rootType < 0).length;
  return { lines, errors, untyped, nameTypes };
}

// ─────────────────────────────── IR 인자 — 식 나무를 색인 배열로

export type TcArrays = {
  kind: number[];
  arg: number[];
  left: number[];
  right: number[];
  root: number[];
  declName: number[];
  want: number[];
};

/**
 * 마디 번호 = 전위 차례 0 부터, 줄을 이어서. kind 0 값 글자 · 1 이름 · 2 연산.
 * arg = 값 글자면 타입 번호 · 이름이면 이름 번호(선언하는 줄 i 의 이름이 i) · 연산이면 연산자 번호.
 */
export function flattenProgram(data: TypeCheckingData): TcArrays {
  const names = data.lines.map((ln) => ln.stmt.name);
  const A: TcArrays = { kind: [], arg: [], left: [], right: [], root: [], declName: [], want: [] };
  const walk = (e: TcExpr): number => {
    const me = A.kind.length;
    A.kind.push(0);
    A.arg.push(0);
    A.left.push(-1);
    A.right.push(-1);
    if ('int' in e) {
      A.arg[me] = typeIndex(data.types, 'int');
    } else if ('float' in e) {
      A.arg[me] = typeIndex(data.types, 'float');
    } else if ('var' in e) {
      const k = names.indexOf(e.var);
      if (k < 0) throw new Error(`${e.var} 는 선언된 이름이 아니다`);
      A.kind[me] = 1;
      A.arg[me] = k;
    } else {
      const o = data.ops.indexOf(e.op);
      if (o < 0) throw new Error(`연산자 목록에 ${e.op} 가 없다`);
      A.kind[me] = 2;
      A.arg[me] = o;
      A.left[me] = walk(e.l);
      A.right[me] = walk(e.r);
    }
    return me;
  };
  for (const [i, ln] of data.lines.entries()) {
    A.root.push(walk(ln.stmt.value));
    A.declName.push(i);
    A.want.push(ln.stmt.type === undefined ? -1 : typeIndex(data.types, ln.stmt.type));
  }
  return A;
}

// ─────────────────────────────── 재생

function typeName(data: TypeCheckingData, ty: number): string {
  if (ty < 0) return '?';
  const s = data.types[ty];
  if (s === undefined) throw new Error(`타입 번호 ${ty} 가 없다`);
  return s;
}

export async function typeCheckingAlgorithm(ctx0: FacetContext<TypeCheckingData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<TypeCheckingData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const shown = new Map<string, number>();
  const report = (name: string, value: number): void => {
    const prev = shown.get(name);
    ctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };

  if (!data.ruleLadder.includes(data.rule)) throw new Error(`처음 규칙 ${data.rule} 가 사다리에 없다`);
  let rule = data.rule;
  const views = lineViews(data);
  const typed = (ty: number) => ({ type: typeName(data, ty), typed: ty >= 0 });

  /** 한 회차 — 끝까지 가면 참, 취소되면 거짓 */
  const playRound = async (ruleValue: number): Promise<boolean> => {
    const ruleDef = data.rules[ruleValue];
    if (ruleDef === undefined) throw new Error(`규칙 ${ruleValue} 가 없다`);
    const tables = buildTables(ruleDef, data.types, data.ops);
    const cells = countCells(tables);
    const check = checkProgram(data, ruleValue);
    let errors = 0;
    let untyped = 0;

    // 걸음 0
    await ctx.emit({
      type: 'round',
      payload: {
        rule: ruleValue,
        ruleId: ruleDef.id,
        opCells: cells.opCells,
        opAll: tables.opRule.length,
        fitCells: cells.fitCells,
        fitAll: tables.fits.length,
        lines: views,
      },
    });
    report('type-errors', 0);
    report('untyped-names', 0);
    if (!(await ctx.sleep(data.stepMs))) return false;

    for (const [i, c] of check.lines.entries()) {
      if (ctx.cancelled) return false;
      const view = views[i];
      if (view === undefined) throw new Error(`줄 ${i} 의 모양이 없다`);
      const expr = exprText(data.lines[i]!.stmt.value);
      const rootIsOp = c.ops.length > 0;

      // (가) 오름 — 연산이 있는 줄만
      if (rootIsOp) {
        const last = c.ops[c.ops.length - 1]!;
        if (last.outcome === 'op-miss') await phase('op-miss');
        else if (last.outcome === 'unknown') await phase('unknown');
        else await phase('rise');
        if (c.missNode >= 0) errors += 1;
        await ctx.emit({
          type: 'rise',
          payload: {
            line: i,
            lineNo: view.lineNo,
            expr,
            outcome: last.outcome,
            leaves: c.leaves.map((lf) => ({ node: lf.node, ...typed(lf.type) })),
            ops: c.ops.map((o) => ({
              node: o.node,
              op: o.op,
              l: typeName(data, o.l),
              r: typeName(data, o.r),
              result: typeName(data, o.result),
              typed: o.result >= 0,
              outcome: o.outcome,
            })),
            missNode: c.missNode,
            errors,
            untyped,
          },
        });
        report('type-errors', errors);
        if (!(await ctx.sleep(data.stepMs))) return false;
        if (ctx.cancelled) return false;
      }

      // (나) 자리
      if (c.settle === 'bind') await phase('bind');
      else if (c.settle === 'decl-take') await phase('decl-take');
      else if (c.settle === 'decl-fit') await phase('decl-fit');
      else await phase('decl-miss');
      if (c.settle === 'decl-miss') errors += 1;
      if (c.settle === 'bind' && c.rootType < 0) untyped += 1;
      const leaf = rootIsOp ? null : c.leaves[0];
      if (leaf === undefined) throw new Error(`줄 ${view.lineNo} 의 잎이 없다`);
      await ctx.emit({
        type: 'settle',
        payload: {
          line: i,
          lineNo: view.lineNo,
          mode: c.settle,
          expr,
          name: view.name,
          ...typed(c.rootType),
          want: c.want >= 0 ? typeName(data, c.want) : null,
          mark: c.mark,
          leaf: leaf === null ? null : { node: leaf.node, ...typed(leaf.type) },
          errors,
          untyped,
        },
      });
      report('type-errors', errors);
      report('untyped-names', untyped);
      if (!(await ctx.sleep(data.stepMs))) return false;
    }

    if (errors !== check.errors || untyped !== check.untyped) {
      throw new Error('걸음에서 센 수와 검사의 수가 다르다');
    }
    await phase('verdict');
    await ctx.emit({
      type: 'verdict',
      payload: {
        errors,
        untyped,
        rejected: errors > 0,
        where: check.lines.flatMap((c, i) => (c.mark === 1 || c.mark === 2 ? [i + 1] : [])),
        byRule: data.ruleLadder.map((rv) => {
          const other = checkProgram(data, rv);
          const def = data.rules[rv];
          if (def === undefined) throw new Error(`규칙 ${rv} 가 없다`);
          return { ruleId: def.id, errors: other.errors, rejected: other.errors > 0 };
        }),
      },
    });
    return true;
  };

  try {
    while (!ctx.cancelled) {
      if (!(await playRound(rule))) return;
      // 입력 대기 — 우리 손잡이가 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'rule') continue;
        const p = input.payload;
        const v = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof v !== 'number' || !data.ruleLadder.includes(v)) continue;
        rule = v;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}

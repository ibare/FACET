/**
 * paste-the-body — 부른 자리 하나를 불린 함수의 몸으로 바꾼다 (인라이닝).
 *
 * 1차 데이터는 줄 목록이다. 줄마다 화면 글자(`text`)와 구조(`stmt`)를 함께 둔다.
 * 알고리즘은 구조에서 글자를 다시 찍어 `text` 와 대조하고(어긋나면 던진다),
 * 부르는 함수(`caller`)에서 불린 함수(`callee`)를 부르는 `let` 줄을 찾아 몸을 붙인다.
 *
 * 규약
 *   - 인자가 이름이나 수이면 매개변수 자리에 그대로 바꿔 넣는다 (줄이 생기지 않는다)
 *   - 인자가 식이면 부른 줄 앞에 `let <매개변수> = <인자 식>` 한 줄을 세운다
 *   - 불린 함수의 이름(매개변수 · let)이 부르는 함수의 이름과 겹치면 뒤에 `2` 를 붙인다
 *   - 불린 함수 몸의 `return <식>` 은 부른 줄 자리에서 `let <받는 이름> = <식>` 이 된다
 *   - 불린 함수의 정의는 지우지 않는다
 *
 * 이벤트 (모두 걸음이다. silent 없음. 걸음 0 은 scene.initial 이 initialData 에서 세운다)
 *   bind-let     { at: number, text: string, from: number,
 *                  param: string, paramCol: number, paramTo: number,
 *                  arg: string, argCol: number, argTo: number }
 *                at        부르는 함수 줄 목록(머리줄이 0)에서 새 줄이 들어설 자리
 *                text      새 줄의 글자 (`let x = side + 1`)
 *                from      불린 함수 줄 목록에서 매개변수가 온 줄 (머리줄 0)
 *                param     새 줄이 묶는 이름 · paramCol 머리줄 안 매개변수의 글자 자리 · paramTo 새 줄 안 자리
 *                arg       인자 식의 글자 · argCol 부른 줄 안 인자의 글자 자리 · argTo 새 줄 안 자리
 *   bind-direct  { param: string, arg: string }
 *                인자가 이름이나 수라 매개변수 자리에 그대로 들어간다 (줄이 생기지 않는다)
 *   paste        { at: number, text: string, from: number }
 *                불린 함수 몸의 let 줄 하나가 부른 자리 앞에 붙는다
 *   return       { at: number, text: string, from: number,
 *                  expr: string, exprCol: number, exprTo: number,
 *                  call: string, callCol: number }
 *                부른 줄이 `let <받는 이름> = <return 의 식>` 이 된다. 부르기가 사라진다
 *                expr    return 의 식(바꿔 넣은 뒤) · exprCol return 줄 안 자리 · exprTo 새 줄 안 자리
 *                call    사라지는 부르기 식의 글자 · callCol 부른 줄 안 자리
 *
 * 글자 자리(col)는 줄의 들여쓰기를 뺀 글자 안에서 센다. 모두 찍개가 구조에서 셈한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PasteOp = '+' | '-' | '*' | '<';

export type PasteExpr =
  | { num: number }
  | { var: string }
  | { op: PasteOp; l: PasteExpr; r: PasteExpr }
  | { call: string; args: PasteExpr[] };

export type PasteStmt =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'let'; name: string; value: PasteExpr }
  | { k: 'set'; name: string; value: PasteExpr }
  | { k: 'return'; value: PasteExpr };

export type PasteLine = { indent: number; text: string; stmt: PasteStmt };

export type PasteTheBodyFacetData = {
  type: 'paste-the-body';
  stepMs: number;
  /** 몸을 내주는 함수 이름 */
  callee: string;
  /** 부르는 자리가 있는 함수 이름 */
  caller: string;
  lines: PasteLine[];
};

const PREC: Record<PasteOp, number> = { '<': 0, '+': 1, '-': 1, '*': 2 };

function isOp(v: unknown): v is PasteOp {
  return v === '+' || v === '-' || v === '*' || v === '<';
}

/** 식을 글자로 찍는다. 괄호는 안쪽이 낮을 때(오른쪽은 같을 때도)만. */
export function showExpr(e: PasteExpr, parent?: PasteOp, right = false): string {
  if ('num' in e) return e.num < 0 ? `(${e.num})` : String(e.num);
  if ('var' in e) return e.var;
  if ('call' in e) return `${e.call}(${e.args.map((a) => showExpr(a)).join(', ')})`;
  if ('op' in e) {
    if (!isOp(e.op)) throw new Error(`paste-the-body: 모르는 연산 ${String(e.op)}`);
    const s = `${showExpr(e.l, e.op)} ${e.op} ${showExpr(e.r, e.op, true)}`;
    if (parent !== undefined && (PREC[e.op] < PREC[parent] || (right && PREC[e.op] === PREC[parent]))) {
      return `(${s})`;
    }
    return s;
  }
  throw new Error(`paste-the-body: 모르는 식 모양 ${JSON.stringify(e)}`);
}

/** 문을 글자로 찍는다 (들여쓰기는 빼고). */
export function showStmt(st: PasteStmt): string {
  switch (st.k) {
    case 'function':
      return `function ${st.name}(${st.params.join(', ')})`;
    case 'let':
      return `let ${st.name} = ${showExpr(st.value)}`;
    case 'set':
      return `${st.name} = ${showExpr(st.value)}`;
    case 'return':
      return `return ${showExpr(st.value)}`;
    default:
      throw new Error(`paste-the-body: 모르는 문 ${JSON.stringify(st)}`);
  }
}

export type PasteFn = { name: string; params: string[]; head: number; body: { line: number; indent: number; stmt: PasteStmt }[] };

/** 줄 목록을 함수로 가른다. 머리줄은 들여쓰기 0 의 function, 몸은 그 아래 들여쓰기 1. */
function splitFunctions(lines: PasteLine[]): PasteFn[] {
  const out: PasteFn[] = [];
  lines.forEach((ln, i) => {
    const got = showStmt(ln.stmt);
    if (got !== ln.text) {
      throw new Error(`paste-the-body: L${i + 1} 의 글자가 구조와 다르다 — ${JSON.stringify(ln.text)} / ${JSON.stringify(got)}`);
    }
    if (ln.stmt.k === 'function') {
      if (ln.indent !== 0) throw new Error(`paste-the-body: L${i + 1} 안쪽 함수는 다루지 않는다`);
      out.push({ name: ln.stmt.name, params: [...ln.stmt.params], head: i, body: [] });
      return;
    }
    const cur = out[out.length - 1];
    if (!cur || ln.indent !== 1) throw new Error(`paste-the-body: L${i + 1} 함수 몸 밖의 줄`);
    cur.body.push({ line: i, indent: ln.indent, stmt: ln.stmt });
  });
  return out;
}

function findFn(fns: PasteFn[], name: string): PasteFn {
  const f = fns.find((x) => x.name === name);
  if (!f) throw new Error(`paste-the-body: 함수 ${name} 가 없다`);
  return f;
}

function isSimple(e: PasteExpr): boolean {
  return 'num' in e || 'var' in e;
}

/** 이름을 바꿔 넣는다. 부르기가 몸에 또 있으면 이 조각이 다루지 않는다. */
function subst(e: PasteExpr, m: Map<string, PasteExpr>, line: number): PasteExpr {
  if ('num' in e) return { num: e.num };
  if ('var' in e) {
    const to = m.get(e.var);
    if (!to) throw new Error(`paste-the-body: L${line + 1} 이름 ${e.var} 가 몸 안에서 정해지지 않았다`);
    return to;
  }
  if ('op' in e) return { op: e.op, l: subst(e.l, m, line), r: subst(e.r, m, line) };
  throw new Error(`paste-the-body: L${line + 1} 붙이는 몸 안의 부르기는 다루지 않는다`);
}

/** initialData 를 좁힌다. 줄 안의 구조는 planPaste 가 글자와 대조하며 잰다. */
export function readPasteData(v: unknown): PasteTheBodyFacetData {
  if (typeof v !== 'object' || v === null) throw new Error('paste-the-body: initialData 가 객체가 아니다');
  const o = v as Record<string, unknown>;
  const { stepMs, callee, caller, lines } = o;
  if (o.type !== 'paste-the-body') throw new Error('paste-the-body: initialData.type 이 다르다');
  if (typeof stepMs !== 'number') throw new Error('paste-the-body: stepMs 가 수가 아니다');
  if (typeof callee !== 'string' || typeof caller !== 'string') throw new Error('paste-the-body: callee · caller 가 글자가 아니다');
  if (!Array.isArray(lines)) throw new Error('paste-the-body: lines 가 목록이 아니다');
  const out: PasteLine[] = lines.map((raw: unknown, i) => {
    if (typeof raw !== 'object' || raw === null) throw new Error(`paste-the-body: L${i + 1} 가 객체가 아니다`);
    const ln = raw as Record<string, unknown>;
    const { indent, text, stmt } = ln;
    if (typeof indent !== 'number' || typeof text !== 'string' || typeof stmt !== 'object' || stmt === null) {
      throw new Error(`paste-the-body: L${i + 1} 의 모양이 다르다`);
    }
    return { indent, text, stmt: stmt as PasteStmt };
  });
  return { type: 'paste-the-body', stepMs, callee, caller, lines: out };
}

export function planPaste(d: PasteTheBodyFacetData): {
  siteRow: number;
  callee: PasteFn;
  caller: PasteFn;
} {
  const fns = splitFunctions(d.lines);
  const callee = findFn(fns, d.callee);
  const caller = findFn(fns, d.caller);
  const idx = caller.body.findIndex(
    (b) => b.stmt.k === 'let' && 'call' in b.stmt.value && b.stmt.value.call === d.callee,
  );
  if (idx < 0) throw new Error(`paste-the-body: ${d.caller} 안에 ${d.callee} 를 부르는 let 줄이 없다`);
  return { siteRow: idx + 1, callee, caller };
}

export async function pasteTheBody(ctx0: FacetContext<PasteTheBodyFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<PasteTheBodyFacetData>;
  const d = readPasteData(ctx.data);
  const stepMs = d.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const { siteRow, callee, caller } = planPaste(d);
  const siteLine = caller.body[siteRow - 1]!;
  const site = siteLine.stmt;
  if (site.k !== 'let' || !('call' in site.value)) {
    throw new Error(`paste-the-body: L${siteLine.line + 1} 부른 줄이 let 이 아니다`);
  }
  const args = site.value.args;
  if (args.length !== callee.params.length) {
    throw new Error(`paste-the-body: L${siteLine.line + 1} 인자 수 ${args.length} · 매개변수 수 ${callee.params.length}`);
  }

  // 이름 겹침 — 부르는 함수가 이미 쓰는 이름이면 뒤에 2
  const taken = new Set<string>(caller.params);
  for (const b of caller.body) if (b.stmt.k === 'let' || b.stmt.k === 'set') taken.add(b.stmt.name);
  const rename = new Map<string, string>();
  const own = [...callee.params];
  for (const b of callee.body) if (b.stmt.k === 'let') own.push(b.stmt.name);
  for (const n of own) {
    const to = taken.has(n) ? `${n}2` : n;
    if (taken.has(to)) throw new Error(`paste-the-body: 이름 ${n} 을 ${to} 로 바꿔도 겹친다`);
    rename.set(n, to);
  }

  const argMap = new Map<string, PasteExpr>();
  const callPrefix = `let ${site.name} = `;
  const calleeHead = `function ${callee.name}(`;
  let at = siteRow;

  // 인자 묶기 — 매개변수마다
  for (let i = 0; i < callee.params.length; i += 1) {
    if (!(await pause())) return;
    const param = callee.params[i]!;
    const arg = args[i]!;
    if (isSimple(arg)) {
      argMap.set(param, arg);
      await ctx.emit({ type: 'bind-direct', payload: { param, arg: showExpr(arg) } });
      continue;
    }
    const name = rename.get(param)!;
    argMap.set(param, { var: name });
    const text = showStmt({ k: 'let', name, value: arg });
    const argCol =
      callPrefix.length + `${callee.name}(`.length + args.slice(0, i).map((a) => `${showExpr(a)}, `).join('').length;
    const paramCol = calleeHead.length + callee.params.slice(0, i).map((p) => `${p}, `).join('').length;
    await ctx.emit({
      type: 'bind-let',
      payload: {
        at,
        text,
        from: 0,
        param: name,
        paramCol,
        paramTo: 'let '.length,
        arg: showExpr(arg),
        argCol,
        argTo: `let ${name} = `.length,
      },
    });
    at += 1;
  }

  // 몸 붙이기 — 불린 함수의 줄마다
  for (const b of callee.body) {
    if (!(await pause())) return;
    const from = b.line - callee.head;
    if (b.stmt.k === 'let') {
      const name = rename.get(b.stmt.name)!;
      const value = subst(b.stmt.value, argMap, b.line);
      argMap.set(b.stmt.name, { var: name });
      await ctx.emit({ type: 'paste', payload: { at, text: showStmt({ k: 'let', name, value }), from } });
      at += 1;
      continue;
    }
    if (b.stmt.k === 'return') {
      if (b !== callee.body[callee.body.length - 1]) {
        throw new Error(`paste-the-body: L${b.line + 1} return 뒤에 줄이 더 있다`);
      }
      const value = subst(b.stmt.value, argMap, b.line);
      await ctx.emit({
        type: 'return',
        payload: {
          at,
          text: showStmt({ k: 'let', name: site.name, value }),
          from,
          expr: showExpr(value),
          exprCol: 'return '.length,
          exprTo: callPrefix.length,
          call: showExpr(site.value),
          callCol: callPrefix.length,
        },
      });
      return;
    }
    throw new Error(`paste-the-body: L${b.line + 1} 붙이는 몸에 ${b.stmt.k} 는 다루지 않는다`);
  }
  throw new Error(`paste-the-body: ${callee.name} 의 몸이 return 으로 끝나지 않는다`);
}

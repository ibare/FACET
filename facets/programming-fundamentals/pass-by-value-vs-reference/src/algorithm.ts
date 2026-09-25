/**
 * 값 전달과 참조 전달 — 줄 구조를 밟으며 부를 때 인자 자리에 무엇이 들어가는지 낸다.
 *
 * `initialData.lines` 가 1차 데이터다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)를 둔다.
 * 이 해석기가 구조를 밟아 자리(place)를 세우고 값을 옮긴다. 글자를 파싱하지 않는다.
 *
 * 해석 규약 (공통 안내문의 줄 걸음):
 *   - 걸음 0 = 시작. 맨 바깥 `function` 줄은 밟지 않는다 (시작 전에 정의돼 있다)
 *   - 넣기 · 출력 = 한 걸음
 *   - 부르기 한 줄(`expr`) = 부름 걸음 + 피호출 몸의 걸음들 + 돌아옴 걸음
 *   - 부를 때 인자마다: 보통 인자는 **새 자리**가 서고 값의 복사본이 들어간다 (`copy`).
 *     `ref` 인자는 새 자리가 서지 않고 부른 쪽 변수의 자리에 인자 이름이 붙는다 (`place`)
 *   - 이 조각의 해석기는 부르기를 `expr` 줄에만 둔다. 식 안의 부르기 · 이름 없는 함수 · 몸 안의 `function` ·
 *     `return` 은 이 조각의 데이터에 없어 받지 않는다 (만나면 던진다)
 *
 * 이벤트 (모두 걸음이다. silent 없음):
 *   - `init`    { lines: { indent: number; text: string }[]; slots: number }
 *                 시작. 코드 전체와, 맨 바깥에서 `let` 으로 설 자리의 수(`slots`)를 싣는다
 *   - `declare` { line: number; depth: number; name: string; place: number; value: Val }
 *                 `let` — 새 자리 `place` 가 서고 `value` 가 들어간다
 *   - `call`    { line: number; depth: number; fn: string; frame: number; binds: Bind[] }
 *                 부름. `Bind` = { param: string; arg: string; mode: 'copy' | 'place'; place: number;
 *                                  from: number | null; value: Val }
 *                 `copy`  — `place` 는 새로 선 자리, `from` 은 복사해 온 변수의 자리(식이면 null)
 *                 `place` — `place` 는 부른 쪽 변수의 자리 그 자체, `from` 은 null
 *   - `assign`  { line: number; depth: number; name: string; place: number; value: Val; was: Val }
 *                 이미 있는 이름에 넣기 — 그 이름이 가리키는 자리 `place` 의 값이 `was` 에서 `value` 로
 *   - `return`  { line: number; depth: number; fn: string; frame: number }
 *                 돌려준 값 없이 부른 줄로 돌아온다. 그 틀과 틀에 선 자리들이 걷힌다
 *   - `show`    { line: number; depth: number; value: Val; from: number | null }
 *                 출력. `from` 은 값을 읽은 자리 (식이면 null)
 *
 * `line` 은 `lines` 의 0 부터 센 자리, `depth` 는 맨 바깥 0 · 틀이 설 때마다 1.
 * `Val` = number | string.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Val = number | string;

export type PassExpr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: '+' | '-' | '*'; l: PassExpr; r: PassExpr }
  | { call: string; args: PassExpr[] };

export type PassParam = string | { name: string; ref: true };

export type PassStmt =
  | { k: 'function'; name: string; params: PassParam[] }
  | { k: 'assign'; to: string; declare?: boolean; value: PassExpr }
  | { k: 'expr'; value: PassExpr }
  | { k: 'show'; value: PassExpr };

export type PassLine = { indent: number; text: string; stmt: PassStmt };

export type PassByValueVsReferenceFacetData = {
  type: 'pass-by-value-vs-reference';
  stepMs: number;
  lines: PassLine[];
};

export type PassBind = {
  param: string;
  arg: string;
  mode: 'copy' | 'place';
  place: number;
  from: number | null;
  value: Val;
};

type Env = { vars: Map<string, number>; parent: Env | null };
type FnDef = { name: string; params: PassParam[]; head: number };

function lookup(env: Env, name: string): number {
  for (let e: Env | null = env; e; e = e.parent) {
    const id = e.vars.get(name);
    if (id !== undefined) return id;
  }
  throw new Error(`pass-by-value-vs-reference: 이름 ${name} 이 어디에도 없다`);
}

function paramName(p: PassParam): string {
  return typeof p === 'string' ? p : p.name;
}

function isRef(p: PassParam): boolean {
  return typeof p !== 'string' && p.ref;
}

/** 식을 글자로 — 부른 쪽 인자를 캡션에 이름으로 보이려 쓴다. */
function exprText(e: PassExpr): string {
  if ('num' in e) return String(e.num);
  if ('str' in e) return `"${e.str}"`;
  if ('var' in e) return e.var;
  if ('op' in e) return `${exprText(e.l)} ${e.op} ${exprText(e.r)}`;
  return `${e.call}(${e.args.map(exprText).join(', ')})`;
}

export async function passByValueVsReference(
  ctx: FacetContext<PassByValueVsReferenceFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<PassByValueVsReferenceFacetData>;
  const { lines, stepMs } = rctx.data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const places = new Map<number, Val>();
  let nextPlace = 1;
  let nextFrame = 1;

  // 맨 바깥 function 줄 — 시작 전에 이미 있다. 맨 바깥 let 의 수도 여기서 센다
  const fns = new Map<string, FnDef>();
  let slots = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (rctx.cancelled) return;
    const s = lines[i].stmt;
    if (lines[i].indent !== 0) continue;
    if (s.k === 'function') fns.set(s.name, { name: s.name, params: s.params, head: i });
    if (s.k === 'assign' && s.declare) slots += 1;
  }

  function evalPure(e: PassExpr, env: Env): Val {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) {
      const v = places.get(lookup(env, e.var));
      if (v === undefined) throw new Error(`pass-by-value-vs-reference: ${e.var} 의 자리가 비었다`);
      return v;
    }
    if ('op' in e) {
      const l = evalPure(e.l, env);
      const r = evalPure(e.r, env);
      if (e.op === '+') {
        return typeof l === 'number' && typeof r === 'number' ? l + r : String(l) + String(r);
      }
      if (typeof l !== 'number' || typeof r !== 'number') {
        throw new Error('pass-by-value-vs-reference: 수가 아닌 값에 - · * 를 걸었다');
      }
      return e.op === '-' ? l - r : l * r;
    }
    throw new Error('pass-by-value-vs-reference: 부르기는 expr 줄에만 둔다');
  }

  /** 한 몸(들여쓰기 `indent` 의 줄들, `from` 부터 `to` 앞까지)을 밟는다. 취소되면 false. */
  async function runBlock(from: number, to: number, indent: number, env: Env, depth: number): Promise<boolean> {
    for (let i = from; i < to; i += 1) {
      if (rctx.cancelled) return false;
      const line = lines[i];
      if (line.indent !== indent) continue;
      const s = line.stmt;
      if (s.k === 'function') {
        if (depth > 0) throw new Error('pass-by-value-vs-reference: 몸 안의 function 은 받지 않는다');
        continue;
      }
      if (s.k === 'assign') {
        const value = evalPure(s.value, env);
        if (!(await pause())) return false;
        if (s.declare) {
          const place = nextPlace++;
          places.set(place, value);
          env.vars.set(s.to, place);
          await rctx.emit({ type: 'declare', payload: { line: i, depth, name: s.to, place, value } });
        } else {
          const place = lookup(env, s.to);
          const was = places.get(place) as Val;
          places.set(place, value);
          await rctx.emit({ type: 'assign', payload: { line: i, depth, name: s.to, place, value, was } });
        }
        continue;
      }
      if (s.k === 'show') {
        const value = evalPure(s.value, env);
        const src = 'var' in s.value ? lookup(env, s.value.var) : null;
        if (!(await pause())) return false;
        await rctx.emit({ type: 'show', payload: { line: i, depth, value, from: src } });
        continue;
      }
      // expr — 부르기 한 줄
      const call = s.value;
      if (!('call' in call)) throw new Error('pass-by-value-vs-reference: expr 줄은 부르기여야 한다');
      const fn = fns.get(call.call);
      if (!fn) throw new Error(`pass-by-value-vs-reference: 함수 ${call.call} 이 없다`);
      if (fn.params.length !== call.args.length) {
        throw new Error(`pass-by-value-vs-reference: ${fn.name} 의 인자 수가 맞지 않는다`);
      }
      const frameEnv: Env = { vars: new Map(), parent: rootEnv };
      const binds: PassBind[] = [];
      for (let j = 0; j < fn.params.length; j += 1) {
        if (rctx.cancelled) return false;
        const p = fn.params[j];
        const arg = call.args[j];
        if (isRef(p)) {
          if (!('var' in arg)) throw new Error('pass-by-value-vs-reference: ref 인자에는 변수 이름만 온다');
          const place = lookup(env, arg.var);
          frameEnv.vars.set(paramName(p), place);
          binds.push({ param: paramName(p), arg: arg.var, mode: 'place', place, from: null, value: places.get(place) as Val });
        } else {
          const value = evalPure(arg, env);
          const place = nextPlace++;
          places.set(place, value);
          frameEnv.vars.set(paramName(p), place);
          const src = 'var' in arg ? lookup(env, arg.var) : null;
          binds.push({ param: paramName(p), arg: exprText(arg), mode: 'copy', place, from: src, value });
        }
      }
      const frame = nextFrame++;
      if (!(await pause())) return false;
      await rctx.emit({ type: 'call', payload: { line: i, depth, fn: fn.name, frame, binds } });
      let end = fn.head + 1;
      while (end < lines.length && lines[end].indent > lines[fn.head].indent) {
        if (rctx.cancelled) return false;
        end += 1;
      }
      const bodyIndent = lines[fn.head].indent + 1;
      if (!(await runBlock(fn.head + 1, end, bodyIndent, frameEnv, depth + 1))) return false;
      // 틀이 걷히며 그 틀에 선 자리(복사본)도 사라진다
      for (const b of binds) {
        if (rctx.cancelled) return false;
        if (b.mode === 'copy') places.delete(b.place);
      }
      if (!(await pause())) return false;
      await rctx.emit({ type: 'return', payload: { line: i, depth, fn: fn.name, frame } });
    }
    return true;
  }

  const rootEnv: Env = { vars: new Map(), parent: null };

  // 걸음 0 — 코드 전체가 이미 읽을 것이라 다음 걸음 앞에 stepMs 를 둔다 (runBlock 의 첫 문)
  await rctx.emit({
    type: 'init',
    payload: { lines: lines.map((l) => ({ indent: l.indent, text: l.text })), slots },
  });
  await runBlock(0, lines.length, 0, rootEnv, 0);
}

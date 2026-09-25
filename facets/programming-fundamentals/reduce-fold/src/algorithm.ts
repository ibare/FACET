/**
 * reduce-fold — 누적값 하나가 목록의 원소를 앞에서부터 차례로 받아들여 값 하나가 된다.
 *
 * 1 차 데이터는 **줄 목록**이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)를
 * 함께 둔다. 이 알고리즘이 구조를 해석해 걸음 차례 · 누적값 · 출력을 셈한다. 글자를 파싱하지 않는다.
 *
 * 걸음은 **원소 걸음**이다 — 맨 위(들여쓰기 0)의 문 하나 = 한 걸음, 다만 `reduce` 가 든 줄은
 * 원소 하나 = 한 걸음으로 편다 (그 줄 자체는 따로 걸음이 없다). 시작값을 놓는 것은 걸음이 아니다 —
 * 첫 원소 걸음의 `before` 가 시작값이다.
 *
 * 해석을 먼저 끝까지 밟아 걸음을 모은 뒤(데이터 순회의 결과), 걸음 사이에 `stepMs` 를 두고 발신한다.
 *
 * ## 이벤트 (전부 걸음 — silent 없음)
 *
 * - `init`    { lines: { indent: number; text: string }[]; accName: string; peak: number }
 *             걸음 0. 프로그램 전체. `accName` 은 reduce 에 넘긴 함수의 첫 인자 이름(누적값),
 *             `peak` 은 누적값이 지나는 값들의 절댓값 가운데 가장 큰 것(그림의 축척 — 없으면 1)
 * - `assign`  { line: number; name: string; value: number | number[] }
 *             reduce 가 들지 않은 대입 줄. `line` 은 0 부터 센 줄 자리
 * - `absorb`  { line: number; index: number; x: number; before: number; after: number; into: string | null }
 *             reduce 의 원소 하나. 누적값 `before` 가 원소 `x` 를 받아 `after` 가 된다.
 *             `into` 는 그 줄의 마지막 원소 걸음에서만 대입받는 이름(`sum`), 나머지는 null
 * - `show`    { line: number; value: number | number[] }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 식. `common.md` 의 줄 구조 가운데 이 조각이 쓰는 것. */
export type ReduceFoldExpr =
  | { num: number }
  | { var: string }
  | { op: string; l: ReduceFoldExpr; r: ReduceFoldExpr }
  | { list: ReduceFoldExpr[] }
  | { fn: { params: string[]; body: ReduceFoldExpr } }
  | { call: string; args: ReduceFoldExpr[] };

export type ReduceFoldStmt =
  | { k: 'assign'; to: string; value: ReduceFoldExpr; declare?: boolean }
  | { k: 'show'; value: ReduceFoldExpr };

export type ReduceFoldLine = { indent: number; text: string; stmt: ReduceFoldStmt };

export type ReduceFoldFacetData = {
  type: 'reduce-fold';
  stepMs: number;
  lines: ReduceFoldLine[];
};

type Fn = { params: string[]; body: ReduceFoldExpr };
type Value = number | boolean | number[] | Fn;

type Step =
  | { kind: 'assign'; line: number; name: string; value: number | number[] }
  | { kind: 'absorb'; line: number; index: number; x: number; before: number; after: number; into: string | null }
  | { kind: 'show'; line: number; value: number | number[] };

type Run = { steps: Step[]; accName: string; peak: number };

function isFn(v: Value): v is Fn {
  return typeof v === 'object' && !Array.isArray(v);
}

function asNumber(v: Value): number {
  if (typeof v !== 'number') throw new Error('reduce-fold: 수가 아닌 값');
  return v;
}

function asList(v: Value): number[] {
  if (!Array.isArray(v)) throw new Error('reduce-fold: 목록이 아닌 값');
  return v;
}

function shown(v: Value): number | number[] {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return [...v];
  throw new Error('reduce-fold: 보일 수 없는 값');
}

/** 줄 구조를 밟아 걸음을 모은다. 셈은 전부 여기서 한다. */
function interpret(lines: ReduceFoldLine[]): Run {
  const globals = new Map<string, Value>();
  const frames: Map<string, Value>[] = [];
  const steps: Step[] = [];
  let accName = 'total';
  let peak = 0;
  let line = 0;

  const read = (name: string): Value => {
    const top = frames[frames.length - 1];
    const local = top?.get(name);
    if (local !== undefined) return local;
    const g = globals.get(name);
    if (g === undefined) throw new Error(`reduce-fold: 없는 이름 ${name}`);
    return g;
  };

  const call = (f: Fn, args: Value[]): Value => {
    frames.push(new Map(f.params.map((p, i) => [p, args[i] as Value])));
    const v = ev(f.body);
    frames.pop();
    return v;
  };

  const binary = (op: string, a: number, b: number): Value => {
    switch (op) {
      case '+': return a + b;
      case '*': return a * b;
      case '>': return a > b;
      case '==': return a === b;
      case 'mod': return a % b;
      case 'div': return Math.trunc(a / b);
      default: throw new Error(`reduce-fold: 모르는 연산 ${op}`);
    }
  };

  const builtin = (name: string, args: Value[]): Value => {
    if (name !== 'reduce') throw new Error(`reduce-fold: 모르는 내장 ${name}`);
    const [src, start, f] = args;
    if (src === undefined || start === undefined || f === undefined || !isFn(f)) {
      throw new Error('reduce-fold: reduce(list, start, f) 꼴이 아니다');
    }
    const items = asList(src);
    accName = f.params[0] ?? accName;
    let acc = asNumber(start);
    peak = Math.max(peak, Math.abs(acc));
    items.forEach((x, index) => {
      const after = asNumber(call(f, [acc, x]));
      steps.push({ kind: 'absorb', line, index, x, before: acc, after, into: null });
      peak = Math.max(peak, Math.abs(after));
      acc = after;
    });
    return acc;
  };

  function ev(e: ReduceFoldExpr): Value {
    if ('num' in e) return e.num;
    if ('var' in e) return read(e.var);
    if ('op' in e) return binary(e.op, asNumber(ev(e.l)), asNumber(ev(e.r)));
    if ('list' in e) return e.list.map((x) => asNumber(ev(x)));
    if ('fn' in e) return { params: [...e.fn.params], body: e.fn.body };
    return builtin(e.call, e.args.map((a) => ev(a)));
  }

  lines.forEach((ln, i) => {
    if (ln.indent !== 0) return;
    line = i;
    const s = ln.stmt;
    if (s.k === 'show') {
      steps.push({ kind: 'show', line: i, value: shown(ev(s.value)) });
      return;
    }
    const before = steps.length;
    const v = ev(s.value);
    globals.set(s.to, v);
    const folded = steps.slice(before).filter((st) => st.kind === 'absorb');
    const last = folded[folded.length - 1];
    if (last && last.kind === 'absorb') last.into = s.to;
    else steps.push({ kind: 'assign', line: i, name: s.to, value: shown(v) });
  });

  return { steps, accName, peak: peak > 0 ? peak : 1 };
}

export async function reduceFold(ctxIn: FacetContext<ReduceFoldFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<ReduceFoldFacetData>;
  const { lines, stepMs } = ctx.data;
  const run = interpret(lines);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 — 프로그램 전체가 이미 읽을 것이다. 첫 발신은 문 밖에 둔다.
  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((l) => ({ indent: l.indent, text: l.text })),
      accName: run.accName,
      peak: run.peak,
    },
  });

  for (const st of run.steps) {
    if (!(await pause())) return;
    switch (st.kind) {
      case 'assign':
        await ctx.emit({ type: 'assign', payload: { line: st.line, name: st.name, value: st.value } });
        break;
      case 'absorb':
        await ctx.emit({
          type: 'absorb',
          payload: { line: st.line, index: st.index, x: st.x, before: st.before, after: st.after, into: st.into },
        });
        break;
      case 'show':
        await ctx.emit({ type: 'show', payload: { line: st.line, value: st.value } });
        break;
    }
  }
}

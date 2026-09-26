/**
 * phi-merges — 갈라진 판이 만나는 자리에서 파이가 들어온 쪽의 판을 고른다.
 *
 * 데이터는 판 없는 세 주소 코드의 명령 구조다. 알고리즘이 그 구조에서 리더 · 블록 · 간선 ·
 * 앞선 블록을 셈하고, 앞선 블록이 하나뿐인 블록에는 판 번호를 미리 매겨 둔다 (걸음 0 의 바탕).
 * 앞선 블록이 둘 이상인 블록(만나는 블록)의 머리에서 이름마다 파이를 둘지 판정하는 것이
 * 걸음이고, 그다음 그 블록 몸의 읽기를 바꾸고, 끝으로 SSA 를 한 번 돌린다.
 *
 * 이벤트 (모두 `ctx.emit` 을 await 한다)
 *
 * - `init` (silent) — 걸음 0 의 바탕을 갈아 끼운다
 *     payload: {
 *       blocks: { id: string; depth: number; lines: Ins[] }[]  // depth = 첫 블록에서 가장 긴 길의 간선 수.
 *                                                // 만나는 블록은 판 없는 줄, 나머지는 판이 매겨진 줄
 *       edges: { from: string; to: string; kind: 'jump' | 'fall' }[]
 *       merge: string                            // 만나는 블록 이름
 *       preds: string[]                          // 만나는 블록의 앞선 블록 (블록 번호 차례)
 *       names: string[]                          // 판을 매기는 이름 (첫 넣기 차례)
 *     }
 * - `phi` — 한 이름의 들어오는 판이 달라 파이 하나가 선다
 *     payload: { name: string; inc: [string, string][]; dst: string }   // inc = [앞선 블록, 그 끝의 판]
 * - `pass` — 한 이름의 들어오는 판이 같아 파이 없이 그 판이 지나간다
 *     payload: { name: string; inc: [string, string][]; ver: string }
 * - `rename` — 만나는 블록 몸의 읽기를 모인 판으로 바꾼다
 *     payload: {
 *       block: string; lines: Ins[]               // 판을 매긴 몸 (라벨은 원래 자리 그대로)
 *       rewrites: { row: number; slot: number; ver: string; was: string; from: 'phi' | 'pass'; src: number }[]
 *         // row = 만나는 블록의 화면 줄(파이 다음부터), slot = 그 줄의 몇 번째 읽는 이름,
 *         // src = 판이 온 자리 (from 이 phi 면 파이 줄, pass 면 지나간 판의 차례)
 *     }
 * - `run` — SSA 를 한 번 돌린다
 *     payload: {
 *       input: [string, number][]                // 인자 이름과 값
 *       path: string[]                           // 지난 블록 차례
 *       from: string                             // 만나는 블록에 들어온 앞선 블록
 *       picks: { dst: string; arg: string; row: number; slot: number }[]  // 파이마다 고른 인자 (파이 줄 · 인자 차례)
 *       values: { block: string; index: number; value: number | boolean }[]  // 돈 줄의 값 (블록 안 화면 차례)
 *       result: number | boolean
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Operand = { var: string } | { num: number };

export type BinOp = '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '>=' | '==' | '!=';

export type Ins =
  | { label: string | null; k: 'bin'; dst: string; l: Operand; op: BinOp; r: Operand }
  | { label: string | null; k: 'copy'; dst: string; src: Operand }
  | { label: string | null; k: 'ifnot'; cond: string; target: string }
  | { label: string | null; k: 'goto'; target: string }
  | { label: string | null; k: 'return'; value: Operand }
  | { label: string | null; k: 'phi'; dst: string; args: [string, string][] };

export type PhiMergesFacetData = {
  type: 'phi-merges';
  stepMs: number;
  /** 판 없는 세 주소 코드. 파이는 두지 않는다 — 알고리즘이 만든다. */
  code: Ins[];
  /** 돌림에 넣는 인자 값 (예로 정한 값). */
  input: [string, number][];
};

type Block = { id: string; start: number; end: number };
type Edge = { from: string; to: string; kind: 'jump' | 'fall' };

const OPS: readonly string[] = ['+', '-', '*', '/', '<', '<=', '>', '>=', '==', '!='];
const TEMP = /^t\d+$/;

function bad(line: number, msg: string): never {
  throw new Error(`phi-merges: ${line} 번째 줄 — ${msg}`);
}

/** 모르는 모양을 조용히 넘기지 않는다. */
function checkOperand(o: Operand, line: number): void {
  if ('var' in o) {
    if (typeof o.var !== 'string' || o.var === '') bad(line, '빈 이름을 읽는다');
    return;
  }
  if ('num' in o) {
    if (typeof o.num !== 'number' || !Number.isFinite(o.num)) bad(line, '수가 아닌 수 피연산자');
    return;
  }
  bad(line, '모르는 피연산자 모양');
}

function checkCode(code: Ins[]): void {
  if (code.length === 0) throw new Error('phi-merges: 명령이 없다');
  code.forEach((ins, i) => {
    const line = i + 1;
    switch (ins.k) {
      case 'bin':
        if (!OPS.includes(ins.op)) bad(line, `모르는 연산 ${String(ins.op)}`);
        checkOperand(ins.l, line);
        checkOperand(ins.r, line);
        return;
      case 'copy':
        checkOperand(ins.src, line);
        return;
      case 'ifnot':
      case 'goto':
        if (!code.some((c) => c.label === ins.target)) bad(line, `없는 라벨로 뛴다: ${ins.target}`);
        return;
      case 'return':
        checkOperand(ins.value, line);
        return;
      case 'phi':
        bad(line, '파이는 데이터에 두지 않는다');
      default:
        bad(line, `모르는 명령 ${String((ins as { k: unknown }).k)}`);
    }
  });
}

/** 리더 규칙 — ① 첫 명령 ② 뜀의 목적지 ③ 뜀 · return 바로 다음. */
function leaders(code: Ins[]): number[] {
  const targets = new Set<string>();
  for (const ins of code) {
    if (ins.k === 'ifnot' || ins.k === 'goto') targets.add(ins.target);
  }
  const out = new Set<number>([0]);
  code.forEach((ins, i) => {
    if (ins.label !== null && targets.has(ins.label)) out.add(i);
    if ((ins.k === 'ifnot' || ins.k === 'goto' || ins.k === 'return') && i + 1 < code.length) out.add(i + 1);
  });
  return [...out].sort((a, b) => a - b);
}

function splitBlocks(code: Ins[]): Block[] {
  const ls = leaders(code);
  return ls.map((start, n) => ({ id: `B${n + 1}`, start, end: n + 1 < ls.length ? ls[n + 1]! : code.length }));
}

function blockOfLabel(code: Ins[], bs: Block[], label: string, line: number): Block {
  const at = code.findIndex((c) => c.label === label);
  const b = bs.find((x) => x.start === at);
  if (!b) bad(line, `라벨 ${label} 이 블록 머리가 아니다`);
  return b;
}

/** 간선 — 블록의 마지막 명령이 정한다. ifnot 은 적힌 뜀을 먼저, 흘러내림을 그다음. */
function findEdges(code: Ins[], bs: Block[]): Edge[] {
  const out: Edge[] = [];
  bs.forEach((b, n) => {
    const lastAt = b.end - 1;
    const last = code[lastAt];
    if (!last) bad(b.end, '빈 블록');
    const next = bs[n + 1];
    if (last.k === 'goto') {
      out.push({ from: b.id, to: blockOfLabel(code, bs, last.target, lastAt + 1).id, kind: 'jump' });
    } else if (last.k === 'ifnot') {
      out.push({ from: b.id, to: blockOfLabel(code, bs, last.target, lastAt + 1).id, kind: 'jump' });
      if (!next) bad(lastAt + 1, 'ifnot 뒤에 흘러내릴 블록이 없다');
      out.push({ from: b.id, to: next.id, kind: 'fall' });
    } else if (last.k !== 'return') {
      if (!next) bad(lastAt + 1, '마지막 블록이 return 으로 끝나지 않는다');
      out.push({ from: b.id, to: next.id, kind: 'fall' });
    }
  });
  return out;
}

/** 첫 블록에서 가장 긴 길의 간선 수. 고리가 있으면 던진다 (이 조각의 SSA 는 고리를 다루지 않는다). */
function blockDepths(bs: Block[], es: Edge[]): Map<string, number> {
  const memo = new Map<string, number>();
  const onStack = new Set<string>();
  const first = bs[0]!.id;
  const depth = (id: string): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (onStack.has(id)) throw new Error(`phi-merges: ${id} 로 되돌아오는 간선이 있다 (고리)`);
    onStack.add(id);
    const ins = es.filter((e) => e.to === id);
    let d: number;
    if (id === first) {
      if (ins.length > 0) throw new Error('phi-merges: 첫 블록으로 들어오는 간선이 있다 (고리)');
      d = 0;
    } else {
      if (ins.length === 0) throw new Error(`phi-merges: 첫 블록에서 닿지 않는 블록 ${id}`);
      d = Math.max(...ins.map((e) => depth(e.from))) + 1;
    }
    onStack.delete(id);
    memo.set(id, d);
    return d;
  };
  for (const b of bs) depth(b.id);
  return memo;
}

function predsOf(bs: Block[], es: Edge[]): Map<string, string[]> {
  const order = new Map(bs.map((b, n) => [b.id, n] as const));
  const m = new Map<string, string[]>();
  for (const b of bs) {
    const ps = [...new Set(es.filter((e) => e.to === b.id).map((e) => e.from))];
    ps.sort((a, c) => order.get(a)! - order.get(c)!);
    m.set(b.id, ps);
  }
  return m;
}

/** 판을 매기는 이름 — 넣어지는 이름 가운데 임시가 아닌 것, 첫 넣기 차례. */
function versionedNames(code: Ins[]): string[] {
  const out: string[] = [];
  for (const ins of code) {
    if ((ins.k === 'bin' || ins.k === 'copy') && !TEMP.test(ins.dst) && !out.includes(ins.dst)) out.push(ins.dst);
  }
  return out;
}

/** 명령 하나의 판 매기기 — 오른쪽을 먼저 지금 판으로, 그다음 왼쪽에 새 판. */
function renameIns(
  ins: Ins,
  cur: Map<string, number>,
  counter: Map<string, number>,
  vnames: string[],
  line: number,
): Ins {
  const read = (o: Operand): Operand => {
    if ('num' in o) return { num: o.num };
    if (!vnames.includes(o.var)) return { var: o.var };
    const v = cur.get(o.var);
    if (v === undefined) bad(line, `넣기 전에 읽는다: ${o.var}`);
    return { var: `${o.var}${v}` };
  };
  const write = (name: string): string => {
    if (!vnames.includes(name)) return name;
    const v = (counter.get(name) ?? 0) + 1;
    counter.set(name, v);
    cur.set(name, v);
    return `${name}${v}`;
  };
  switch (ins.k) {
    case 'bin': {
      const l = read(ins.l);
      const r = read(ins.r);
      return { label: ins.label, k: 'bin', dst: write(ins.dst), l, op: ins.op, r };
    }
    case 'copy': {
      const src = read(ins.src);
      return { label: ins.label, k: 'copy', dst: write(ins.dst), src };
    }
    case 'ifnot': {
      const c = read({ var: ins.cond });
      if (!('var' in c)) bad(line, 'ifnot 의 조건이 이름이 아니다');
      return { label: ins.label, k: 'ifnot', cond: c.var, target: ins.target };
    }
    case 'goto':
      return { label: ins.label, k: 'goto', target: ins.target };
    case 'return':
      return { label: ins.label, k: 'return', value: read(ins.value) };
    case 'phi':
      return bad(line, '파이는 데이터에 두지 않는다');
  }
}

/** 명령 오른쪽의 읽는 이름 — 나오는 차례대로. 수는 읽는 자리가 아니다. */
function readsOf(ins: Ins): string[] {
  const names = (os: Operand[]): string[] => os.flatMap((o) => ('var' in o ? [o.var] : []));
  switch (ins.k) {
    case 'bin':
      return names([ins.l, ins.r]);
    case 'copy':
      return names([ins.src]);
    case 'return':
      return names([ins.value]);
    case 'ifnot':
      return [ins.cond];
    case 'goto':
      return [];
    case 'phi':
      return ins.args.map(([, x]) => x);
  }
}

function copyIns(ins: Ins): Ins {
  return JSON.parse(JSON.stringify(ins)) as Ins;
}

type Value = number | boolean;

function num(v: Value, line: number): number {
  if (typeof v !== 'number') bad(line, '참 · 거짓에 셈 연산을 건다');
  return v;
}

function applyOp(op: BinOp, a: Value, b: Value, line: number): Value {
  switch (op) {
    case '+':
      return num(a, line) + num(b, line);
    case '-':
      return num(a, line) - num(b, line);
    case '*':
      return num(a, line) * num(b, line);
    case '/':
      if (num(b, line) === 0) bad(line, '0 으로 나눈다');
      return num(a, line) / num(b, line);
    case '<':
      return num(a, line) < num(b, line);
    case '<=':
      return num(a, line) <= num(b, line);
    case '>':
      return num(a, line) > num(b, line);
    case '>=':
      return num(a, line) >= num(b, line);
    case '==':
      return a === b;
    case '!=':
      return a !== b;
  }
}

function readVal(env: Map<string, Value>, o: Operand, line: number): Value {
  if ('num' in o) return o.num;
  const v = env.get(o.var);
  if (v === undefined) bad(line, `값이 없는 이름을 읽는다: ${o.var}`);
  return v;
}

const RUN_LIMIT = 10_000;

/** 판 없는 코드를 줄 차례로 돌린다 — SSA 돌림과 견주는 대조용. */
function runPlain(code: Ins[], input: [string, number][]): Value {
  const env = new Map<string, Value>(input);
  let pc = 0;
  for (let guard = 0; guard < RUN_LIMIT; guard += 1) {
    const ins = code[pc];
    if (!ins) bad(pc + 1, 'return 없이 코드가 끝난다');
    const line = pc + 1;
    switch (ins.k) {
      case 'bin':
        env.set(ins.dst, applyOp(ins.op, readVal(env, ins.l, line), readVal(env, ins.r, line), line));
        pc += 1;
        break;
      case 'copy':
        env.set(ins.dst, readVal(env, ins.src, line));
        pc += 1;
        break;
      case 'ifnot': {
        const c = readVal(env, { var: ins.cond }, line);
        if (typeof c !== 'boolean') bad(line, 'ifnot 의 조건이 참 · 거짓이 아니다');
        pc = c ? pc + 1 : code.findIndex((x) => x.label === ins.target);
        break;
      }
      case 'goto':
        pc = code.findIndex((x) => x.label === ins.target);
        break;
      case 'return':
        return readVal(env, ins.value, line);
      case 'phi':
        bad(line, '판 없는 코드에 파이가 있다');
    }
  }
  throw new Error('phi-merges: 돌림이 끝나지 않는다');
}

type RunOut = {
  path: string[];
  cameFrom: Map<string, string>;
  values: { block: string; index: number; value: Value }[];
  result: Value;
};

/** SSA 를 블록 단위로 돌린다. 파이는 들어온 간선의 인자를 고른다. */
function runSsa(order: string[], ssa: Map<string, Ins[]>, input: [string, number][], es: Edge[]): RunOut {
  const env = new Map<string, Value>(input);
  const path: string[] = [];
  const cameFrom = new Map<string, string>();
  const values: RunOut['values'] = [];
  let at = order[0]!;
  let from: string | null = null;
  for (let guard = 0; guard < RUN_LIMIT; guard += 1) {
    path.push(at);
    if (from !== null) cameFrom.set(at, from);
    const lines = ssa.get(at);
    if (!lines) throw new Error(`phi-merges: 없는 블록 ${at}`);
    // 파이는 블록 머리에서 한꺼번에 고른다 — 옛 값으로 읽는다
    const picked: [string, Value][] = [];
    let next: string | null = null;
    let ret: Value | null = null;
    for (let i = 0; i < lines.length; i += 1) {
      const ins = lines[i]!;
      const line = i + 1;
      if (ins.k === 'phi') {
        const arg = ins.args.find(([b]) => b === from);
        if (!arg) bad(line, `${at} 의 파이에 들어온 블록의 인자가 없다`);
        const v = readVal(env, { var: arg[1] }, line);
        picked.push([ins.dst, v]);
        values.push({ block: at, index: i, value: v });
        continue;
      }
      for (const [k, v] of picked.splice(0)) env.set(k, v);
      if (ins.k === 'bin') {
        const v = applyOp(ins.op, readVal(env, ins.l, line), readVal(env, ins.r, line), line);
        env.set(ins.dst, v);
        values.push({ block: at, index: i, value: v });
      } else if (ins.k === 'copy') {
        const v = readVal(env, ins.src, line);
        env.set(ins.dst, v);
        values.push({ block: at, index: i, value: v });
      } else if (ins.k === 'ifnot') {
        const c = readVal(env, { var: ins.cond }, line);
        if (typeof c !== 'boolean') bad(line, 'ifnot 의 조건이 참 · 거짓이 아니다');
        const kind = c ? 'fall' : 'jump';
        const e = es.find((x) => x.from === at && x.kind === kind);
        if (!e) bad(line, `${at} 에서 나갈 간선이 없다`);
        next = e.to;
      } else if (ins.k === 'goto') {
        const e = es.find((x) => x.from === at && x.kind === 'jump');
        if (!e) bad(line, `${at} 에서 나갈 간선이 없다`);
        next = e.to;
      } else {
        ret = readVal(env, ins.value, line);
        values.push({ block: at, index: i, value: ret });
      }
    }
    for (const [k, v] of picked) env.set(k, v);
    if (ret !== null) return { path, cameFrom, values, result: ret };
    if (next === null) {
      const e = es.find((x) => x.from === at && x.kind === 'fall');
      if (!e) throw new Error(`phi-merges: ${at} 에서 나갈 간선이 없다`);
      next = e.to;
    }
    from = at;
    at = next;
  }
  throw new Error('phi-merges: 돌림이 끝나지 않는다');
}

export async function phiMerges(ctxBase: FacetContext<PhiMergesFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<PhiMergesFacetData>;
  const { code, input, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  checkCode(code);
  const bs = splitBlocks(code);
  const es = findEdges(code, bs);
  const preds = predsOf(bs, es);
  const vnames = versionedNames(code);
  const merges = bs.filter((b) => preds.get(b.id)!.length > 1);
  if (merges.length !== 1) throw new Error(`phi-merges: 만나는 블록이 하나여야 한다 (${merges.length})`);
  const merge = merges[0]!;
  const mergePreds = preds.get(merge.id)!;

  // 판 매기기 — 만나는 블록 앞은 걸음 0 의 바탕이다
  const counter = new Map<string, number>();
  const endVer = new Map<string, Map<string, number>>();
  const ssa = new Map<string, Ins[]>();
  type Judge = { name: string; inc: [string, string][]; dst: string | null };
  const judged: Judge[] = [];
  let mergeBody: Ins[] = [];
  const phis: Ins[] = [];
  for (const b of bs) {
    const ps = preds.get(b.id)!;
    let cur: Map<string, number>;
    if (ps.length === 0) {
      cur = new Map();
    } else if (ps.length === 1) {
      const pv = endVer.get(ps[0]!);
      if (!pv) bad(b.start + 1, `${b.id} 의 앞선 블록 ${ps[0]!} 이 아직 판이 없다`);
      cur = new Map(pv);
    } else {
      cur = new Map();
      for (const v of vnames) {
        const inc: [string, string][] = ps.map((q) => {
          const pv = endVer.get(q);
          if (!pv) bad(b.start + 1, `${b.id} 의 앞선 블록 ${q} 이 아직 판이 없다 (고리)`);
          const n = pv.get(v);
          if (n === undefined) bad(b.start + 1, `${v} 가 ${q} 끝에서 넣어지지 않았다`);
          return [q, `${v}${n}`];
        });
        if (new Set(inc.map(([, x]) => x)).size > 1) {
          const n = (counter.get(v) ?? 0) + 1;
          counter.set(v, n);
          cur.set(v, n);
          phis.push({ label: null, k: 'phi', dst: `${v}${n}`, args: inc.map(([q, x]) => [q, x]) });
          judged.push({ name: v, inc, dst: `${v}${n}` });
        } else {
          cur.set(v, Number(inc[0]![1].slice(v.length)));
          judged.push({ name: v, inc, dst: null });
        }
      }
    }
    const body = code.slice(b.start, b.end).map((ins, i) => renameIns(ins, cur, counter, vnames, b.start + i + 1));
    if (b.id === merge.id) {
      mergeBody = body;
      const lab = body[0]!.label;
      ssa.set(b.id, [
        ...phis.map((p, i) => ({ ...p, label: i === 0 ? lab : null })),
        ...body.map((x, i) => ({ ...x, label: i === 0 && phis.length > 0 ? null : x.label })),
      ]);
    } else {
      ssa.set(b.id, body);
    }
    endVer.set(b.id, new Map(cur));
  }

  const depths = blockDepths(bs, es);

  // 걸음 0 — 만나는 블록은 판 없는 줄로 시작한다
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      blocks: bs.map((b) => ({
        id: b.id,
        depth: depths.get(b.id)!,
        lines: b.id === merge.id ? code.slice(b.start, b.end).map(copyIns) : ssa.get(b.id)!.map(copyIns),
      })),
      edges: es.map((e) => ({ ...e })),
      merge: merge.id,
      preds: [...mergePreds],
      names: [...vnames],
    },
  });

  for (const j of judged) {
    if (!(await pause())) return;
    if (j.dst !== null) {
      await ctx.emit({ type: 'phi', payload: { name: j.name, inc: j.inc.map(([q, x]) => [q, x]), dst: j.dst } });
    } else {
      await ctx.emit({ type: 'pass', payload: { name: j.name, inc: j.inc.map(([q, x]) => [q, x]), ver: j.inc[0]![1] } });
    }
  }

  if (!(await pause())) return;
  const raw = code.slice(merge.start, merge.end);
  const passVers = judged.filter((j) => j.dst === null).map((j) => j.inc[0]![1]);
  const phiDsts = phis.map((p) => (p.k === 'phi' ? p.dst : bad(merge.start + 1, '파이가 아닌 줄')));
  const rewrites: { row: number; slot: number; ver: string; was: string; from: 'phi' | 'pass'; src: number }[] = [];
  raw.forEach((ins, i) => {
    const line = merge.start + i + 1;
    const ra = readsOf(ins);
    const rb = readsOf(mergeBody[i]!);
    if (ra.length !== rb.length) bad(line, '판 매기기가 읽는 자리의 수를 바꿨다');
    ra.forEach((was, k) => {
      const ver = rb[k]!;
      if (was === ver) return; // 판이 없는 이름(임시 · 인자)은 바뀌지 않는다 — 셀 것이 아니다
      const pi = phiDsts.indexOf(ver);
      const si = passVers.indexOf(ver);
      if (pi < 0 && si < 0) bad(line, `${ver} 가 파이에서도 지나간 판에서도 오지 않았다`);
      rewrites.push(
        pi >= 0
          ? { row: phis.length + i, slot: k, ver, was, from: 'phi', src: pi }
          : { row: phis.length + i, slot: k, ver, was, from: 'pass', src: si },
      );
    });
  });
  await ctx.emit({
    type: 'rename',
    payload: {
      block: merge.id,
      lines: mergeBody.map(copyIns),
      rewrites,
    },
  });

  if (!(await pause())) return;
  const order = bs.map((b) => b.id);
  const out = runSsa(order, ssa, input, es);
  const plain = runPlain(code, input);
  if (plain !== out.result) throw new Error(`phi-merges: SSA 돌림(${String(out.result)})이 판 없는 돌림(${String(plain)})과 다르다`);
  const from = out.cameFrom.get(merge.id);
  if (from === undefined) throw new Error('phi-merges: 돌림이 만나는 블록을 지나지 않는다');
  const picks = phis.map((p, row) => {
    if (p.k !== 'phi') throw new Error('phi-merges: 파이가 아닌 줄');
    const slot = p.args.findIndex(([q]) => q === from);
    if (slot < 0) throw new Error(`phi-merges: ${p.dst} 에 ${from} 의 인자가 없다`);
    return { dst: p.dst, arg: p.args[slot]![1], row, slot };
  });
  await ctx.emit({
    type: 'run',
    payload: {
      input: input.map(([k, v]) => [k, v]),
      path: out.path,
      from,
      picks,
      values: out.values,
      result: out.result,
    },
  });
  await pause();
}

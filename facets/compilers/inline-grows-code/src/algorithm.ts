/**
 * inline-grows-code — 부르는 자리마다 몸통을 붙여 넣으면 실행은 얼마나 줄고 코드는 얼마나 느는가.
 *
 * 세 주소 코드 한 벌(`initialData.program`)에서 `entry` 함수의 부른 자리를 위 → 아래로 하나씩 몸통으로 바꾼다.
 * 매개변수는 인자 이름으로, 피호출 몸의 임시 이름은 프로그램에서 가장 큰 번호 다음부터 새로 붙이되
 * `return` 이 돌려주던 이름은 부른 줄의 받는 이름으로 바꾼다 — 그래서 `return` 줄은 옮겨 오지 않는다.
 * 피호출 정의는 지우지 않는다. 크기(명령 수)와 실행(`entry` 한 번에 밟는 명령 수)은 실행하지 않고 구조에서 센다.
 *
 * 줄 구조와 그 구조에서 곧장 나오는 셈(글자 찍기 · 크기 · 밟는 차례)은 이 파일이 가진다. 장면과 그림은
 * 타입과 좁히개만 가져가고 셈을 다시 돌리지 않는다.
 *
 * 이벤트
 * - `init` (silent) — payload `{ size: number; exec: number; calls: number; callee: string; peakSize: number;
 *   peakExec: number; trace: TraceRow[] }`
 *   걸음 0 의 셈. `calls` 는 `entry` 안의 부른 자리 수, `callee` 는 불리는 함수(부른 자리가 모두 한 함수를 부른다),
 *   `peak*` 는 끝까지 가며 가장 커지는 값(그림의 축척), `trace` 는 `entry` 한 번에 밟는 차례
 * - `inline` — payload `{ callId: string; pasted: Line[]; size: number; exec: number; remaining: number; trace: TraceRow[] }`
 *   부른 줄 `callId` 가 `pasted` 로 바뀌었다. `size` · `exec` · `trace` 는 바꾼 뒤의 셈, `remaining` 은 남은 부른 자리 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type InlineGrowsCodeFacetData = {
  type: 'inline-grows-code';
  stepMs: number;
  entry: string;
  program: { indent: number; text: string; ins: unknown }[];
};

// ───────────────────────── 줄 구조 ─────────────────────────

export type Operand = string | number;
export type OpSym = '+' | '-' | '*';

/** 명령 하나 — 머리줄 `function` 은 명령이 아니다(크기에 들지 않는다) */
export type Ins =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'op'; dst: string; op: OpSym; a: Operand; b: Operand }
  | { k: 'call'; dst: string; fn: string; args: string[] }
  | { k: 'return'; value: Operand };

/** 줄 하나 — 원래 줄은 `L<번호>`, 붙여 넣은 줄은 `<부른 줄>><베껴 온 줄>` */
export type Line = {
  id: string;
  ins: Ins;
  /** 구조에서 찍은 글자 (들여쓰기 없이) */
  text: string;
  /** 이 줄이 들어 있는 함수 */
  fn: string;
  /** 이 명령의 몸이 처음 적힌 함수 — 붙여 넣은 줄은 피호출 함수 */
  origin: string;
  /** 붙여 넣은 줄이면 베껴 온 줄의 id */
  src: string | null;
};

export type TraceRow = { key: string; kind: 'op' | 'call' | 'return'; origin: string };

const OPS: readonly OpSym[] = ['+', '-', '*'];

function isName(u: unknown): u is string {
  return typeof u === 'string' && /^[A-Za-z_]\w*$/.test(u);
}

function isOperand(u: unknown): u is Operand {
  return isName(u) || (typeof u === 'number' && Number.isInteger(u));
}

function names(u: unknown, where: string): string[] {
  if (!Array.isArray(u)) throw new Error(`${where}: 이름 목록이 배열이 아니다`);
  return u.map((x, i) => {
    if (!isName(x)) throw new Error(`${where}: ${i} 번째 이름이 이름 꼴이 아니다`);
    return x;
  });
}

/** 명령 구조를 좁힌다 — 모르는 `k` · 모르는 연산 · 빈 칸은 줄 자리를 담아 던진다 */
export function readIns(u: unknown, where: string): Ins {
  if (typeof u !== 'object' || u === null) throw new Error(`${where}: 명령이 객체가 아니다`);
  const o = u as Record<string, unknown>;
  switch (o.k) {
    case 'function':
      if (!isName(o.name)) throw new Error(`${where}: 함수 이름이 없다`);
      return { k: 'function', name: o.name, params: names(o.params, where) };
    case 'op': {
      const op = OPS.find((s) => s === o.op);
      if (!op) throw new Error(`${where}: 모르는 연산 ${String(o.op)}`);
      if (!isName(o.dst)) throw new Error(`${where}: 받는 이름이 없다`);
      if (!isOperand(o.a) || !isOperand(o.b)) throw new Error(`${where}: 피연산자가 이름도 정수도 아니다`);
      return { k: 'op', dst: o.dst, op, a: o.a, b: o.b };
    }
    case 'call':
      if (!isName(o.dst) || !isName(o.fn)) throw new Error(`${where}: 부르기의 받는 이름 · 함수 이름이 없다`);
      return { k: 'call', dst: o.dst, fn: o.fn, args: names(o.args, where) };
    case 'return':
      if (!isOperand(o.value)) throw new Error(`${where}: 돌려주는 값이 없다`);
      return { k: 'return', value: o.value };
    default:
      throw new Error(`${where}: 모르는 명령 ${String(o.k)}`);
  }
}

/** 명령의 글자 — 들여쓰기 없이 */
export function insText(ins: Ins): string {
  switch (ins.k) {
    case 'function':
      return `function ${ins.name}(${ins.params.join(', ')})`;
    case 'op':
      return `${ins.dst} = ${ins.a} ${ins.op} ${ins.b}`;
    case 'call':
      return `${ins.dst} = call ${ins.fn}(${ins.args.join(', ')})`;
    case 'return':
      return `return ${ins.value}`;
  }
}

/** 머리줄은 들여쓰기 0, 명령은 1 */
export function indentOf(ins: Ins): number {
  return ins.k === 'function' ? 0 : 1;
}

/**
 * `initialData.program` 을 줄 목록으로 — 줄마다 들여쓰기 · 글자가 구조에서 찍은 것과 같은지 대조한다.
 */
export function readProgram(raw: unknown): Line[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('program: 줄 목록이 비었다');
  const out: Line[] = [];
  let fn: string | null = null;
  raw.forEach((u, i) => {
    const where = `L${i + 1}`;
    if (typeof u !== 'object' || u === null) throw new Error(`${where}: 줄이 객체가 아니다`);
    const o = u as Record<string, unknown>;
    const ins = readIns(o.ins, where);
    const text = insText(ins);
    if (o.indent !== indentOf(ins)) throw new Error(`${where}: 들여쓰기 ${String(o.indent)} 이 명령 모양과 어긋난다`);
    if (o.text !== text) throw new Error(`${where}: 글자 "${String(o.text)}" 이 구조에서 찍은 "${text}" 와 다르다`);
    if (ins.k === 'function') fn = ins.name;
    if (fn === null) throw new Error(`${where}: 함수 머리줄보다 앞에 명령이 있다`);
    out.push({ id: where, ins, text, fn, origin: fn, src: null });
  });
  return out;
}

/** 함수의 머리줄과 몸 */
export function funcOf(program: readonly Line[], name: string): { head: Line; body: Line[] } {
  const at = program.findIndex((l) => l.ins.k === 'function' && l.ins.name === name);
  const head = program[at];
  if (at < 0 || !head) throw new Error(`함수 ${name} 이 코드에 없다`);
  const body: Line[] = [];
  for (let i = at + 1; i < program.length; i += 1) {
    const l = program[i];
    if (!l) throw new Error(`${name}: ${i} 번째 줄이 비었다`);
    if (l.ins.k === 'function') break;
    body.push(l);
  }
  return { head, body };
}

/** 크기 — 프로그램 전체의 명령 수 (머리줄 빼고, `return` 넣고) */
export function sizeOf(program: readonly Line[]): number {
  return program.filter((l) => l.ins.k !== 'function').length;
}

/**
 * `entry` 를 한 번 돌릴 때 밟는 명령의 차례 — 실행하지 않고 구조에서 편다.
 * 갈래가 없어 곧은 줄은 한 번씩, `call` 은 그 한 줄 다음에 피호출 몸 전부(그 `return` 까지).
 * 피호출 안의 줄 key 는 `<부른 줄>><피호출 줄>` — 붙여 넣은 줄의 id 와 같은 꼴이다.
 */
export function traceOf(program: readonly Line[], entry: string): TraceRow[] {
  const rows: TraceRow[] = [];
  const walk = (name: string, prefix: string, depth: number): void => {
    if (depth > 16) throw new Error(`${name}: 부르기가 너무 깊다 — 되부르기는 셈하지 않는다`);
    const { head, body } = funcOf(program, name);
    for (const l of body) {
      const key = prefix + l.id;
      if (l.ins.k === 'return') {
        rows.push({ key, kind: 'return', origin: l.origin });
        return;
      }
      if (l.ins.k === 'call') {
        rows.push({ key, kind: 'call', origin: l.origin });
        walk(l.ins.fn, `${key}>`, depth + 1);
      } else {
        rows.push({ key, kind: 'op', origin: l.origin });
      }
    }
    throw new Error(`${head.id}: 함수 ${name} 이 return 없이 끝난다`);
  };
  walk(entry, '', 0);
  return rows;
}

// ───────────────────────── 변환 ─────────────────────────

type Planned = { callId: string; pasted: Line[]; size: number; exec: number; remaining: number; trace: TraceRow[] };

function tempNumber(name: string): number | null {
  const m = /^t(\d+)$/.exec(name);
  return m && m[1] !== undefined ? Number(m[1]) : null;
}

/** 프로그램에 나오는 임시 이름 번호 중 가장 큰 것 다음 */
function nextTempOf(program: readonly Line[]): number {
  let top = 0;
  for (const l of program) {
    const ins = l.ins;
    const seen: Operand[] =
      ins.k === 'op' ? [ins.dst, ins.a, ins.b] : ins.k === 'call' ? [ins.dst, ...ins.args] : ins.k === 'return' ? [ins.value] : ins.params;
    for (const x of seen) {
      const n = typeof x === 'string' ? tempNumber(x) : null;
      if (n !== null && n > top) top = n;
    }
  }
  return top + 1;
}

function callSites(program: readonly Line[], entry: string): Line[] {
  return funcOf(program, entry).body.filter((l) => l.ins.k === 'call');
}

/** 부른 줄 하나를 피호출 몸으로 바꾼 코드와, 다음에 쓸 임시 번호 */
function inlineAt(program: readonly Line[], site: Line, entry: string, next: number): { program: Line[]; pasted: Line[]; next: number } {
  if (site.ins.k !== 'call') throw new Error(`${site.id}: 부르는 줄이 아니다`);
  const call = site.ins;
  const { head, body } = funcOf(program, call.fn);
  if (head.ins.k !== 'function') throw new Error(`${head.id}: 머리줄이 아니다`);
  const params = head.ins.params;
  if (params.length !== call.args.length) throw new Error(`${site.id}: 인자 ${call.args.length} 과 매개변수 ${params.length} 가 어긋난다`);
  const last = body[body.length - 1];
  if (!last || last.ins.k !== 'return') throw new Error(`${head.id}: ${call.fn} 의 몸이 return 으로 끝나지 않는다`);
  const back = last.ins.value;
  if (typeof back !== 'string') throw new Error(`${last.id}: 수를 곧장 돌려주는 몸은 받는 이름으로 바꿀 자리가 없다`);

  const rename = new Map<string, string>();
  params.forEach((p, i) => {
    const a = call.args[i];
    if (a === undefined) throw new Error(`${site.id}: ${i} 번째 인자가 없다`);
    rename.set(p, a);
  });
  const operand = (x: Operand, where: string): Operand => {
    if (typeof x === 'number') return x;
    const to = rename.get(x);
    if (to === undefined) throw new Error(`${where}: 이름 ${x} 이 매개변수도 앞선 임시도 아니다`);
    return to;
  };

  let n = next;
  const pasted: Line[] = [];
  for (const l of body.slice(0, -1)) {
    if (l.ins.k !== 'op') throw new Error(`${l.id}: 피호출 몸에 연산이 아닌 명령이 있다 — 이 조각은 한 겹만 편다`);
    const a = operand(l.ins.a, l.id);
    const b = operand(l.ins.b, l.id);
    let dst: string;
    if (l.ins.dst === back) {
      dst = call.dst;
    } else {
      dst = `t${n}`;
      n += 1;
    }
    rename.set(l.ins.dst, dst);
    const ins: Ins = { k: 'op', dst, op: l.ins.op, a, b };
    pasted.push({ id: `${site.id}>${l.id}`, ins, text: insText(ins), fn: entry, origin: l.origin, src: l.id });
  }
  if (!rename.has(back)) throw new Error(`${last.id}: 돌려주는 이름 ${back} 을 몸이 만들지 않는다`);

  const at = program.indexOf(site);
  return { program: [...program.slice(0, at), ...pasted, ...program.slice(at + 1)], pasted, next: n };
}

export async function inlineGrowsCode(ctx0: FacetContext<InlineGrowsCodeFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<InlineGrowsCodeFacetData>;
  const { stepMs, entry } = ctx.data;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('stepMs 가 양수가 아니다');
  if (typeof entry !== 'string') throw new Error('entry 가 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 변환을 끝까지 먼저 센다 — 그림이 축척을 걸음 0 에서 알게
  const start = readProgram(ctx.data.program);
  const trace0 = traceOf(start, entry);
  const sites0 = callSites(start, entry);
  const callees = [
    ...new Set(
      sites0.map((l) => {
        if (l.ins.k !== 'call') throw new Error(`${l.id}: 부르는 줄이 아니다`);
        return l.ins.fn;
      }),
    ),
  ];
  const callee = callees[0];
  if (callees.length !== 1 || callee === undefined) {
    throw new Error(`${entry}: 부른 자리가 한 함수를 부르지 않는다 (${callees.join(', ')})`);
  }
  const plan: Planned[] = [];
  let program: Line[] = start;
  let next = nextTempOf(start);
  let peakSize = sizeOf(start);
  let peakExec = trace0.length;
  for (;;) {
    if (ctx.cancelled) return;
    const site = callSites(program, entry)[0];
    if (!site) break;
    const r = inlineAt(program, site, entry, next);
    program = r.program;
    next = r.next;
    const size = sizeOf(program);
    const trace = traceOf(program, entry);
    peakSize = Math.max(peakSize, size);
    peakExec = Math.max(peakExec, trace.length);
    plan.push({ callId: site.id, pasted: r.pasted, size, exec: trace.length, remaining: callSites(program, entry).length, trace });
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { size: sizeOf(start), exec: trace0.length, calls: sites0.length, callee, peakSize, peakExec, trace: trace0 },
  });

  // 걸음 0 은 앞 프로그램 전체라 읽을 것이 있다 — 첫 바꾸기 앞에도 머문다
  for (const s of plan) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'inline', payload: s });
  }
}

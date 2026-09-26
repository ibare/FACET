/**
 * interference-graph — 명령 열을 끝에서 앞으로 거슬러 훑으며 같이 산 값끼리 선을 긋고,
 * 다 훑은 뒤 값마다 이웃이 쓰지 않은 가장 낮은 번호의 레지스터를 준다.
 *
 * 1차 데이터는 할당 전 명령 구조 `{ op, dst, srcs, mem, imm }` 이다. 산 값 · 선 · 레지스터는
 * 전부 이 구조에서 셈한다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 *   scan   줄 하나를 거슬러 넘는다 (L 끝 → L1 차례)
 *     payload: {
 *       line: number             // 넘는 줄 번호 (1 부터)
 *       def: string | null       // 그 줄이 정의하는 값 (없으면 null — store)
 *       after: string[]          // 그 줄 뒤에 산 값 (정의 차례로 줄 세움)
 *       before: string[]         // 그 줄 앞에 산 값 = (after − def) ∪ 읽는 값
 *       entered: string[]        // before 가운데 이 줄의 읽기로 새로 살아난 값
 *       added: [string, string][]// 이 줄에서 새로 그은 선 (앞 값이 정의 차례로 앞선다)
 *     }
 *
 *   color  값 하나에 레지스터를 준다 (정의 차례로)
 *     payload: {
 *       value: string                               // 칠하는 값
 *       reg: number                                 // 받은 레지스터 번호 (r1 = 1)
 *       neighbors: { value: string; reg: number }[] // 이미 칠한 이웃과 그 레지스터
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 할당 전 기계 명령 하나. 레지스터 자리에 임시 이름(t1 · t2 …)이 있다. */
export type Ins = {
  op: 'load' | 'store' | 'add' | 'sub' | 'mul' | 'addi';
  dst: string | null;
  srcs: string[];
  mem: string | null;
  imm: number | null;
};

export type InterferenceGraphFacetData = {
  type: 'interference-graph';
  stepMs: number;
  program: Ins[];
};

const OPS: readonly Ins['op'][] = ['load', 'store', 'add', 'sub', 'mul', 'addi'];

function isOp(v: unknown): v is Ins['op'] {
  return typeof v === 'string' && (OPS as readonly string[]).includes(v);
}

/** 명령 하나를 좁힌다. 모양이 명령 종류와 맞지 않으면 줄 번호를 담아 던진다. */
function narrowIns(raw: unknown, line: number): Ins {
  if (typeof raw !== 'object' || raw === null) throw new Error(`L${line}: 명령이 객체가 아니다`);
  const r = raw as Record<string, unknown>;
  const op = r['op'];
  if (!isOp(op)) throw new Error(`L${line}: 모르는 명령 ${String(op)}`);
  const dst = r['dst'];
  const mem = r['mem'];
  const imm = r['imm'];
  const srcsRaw = r['srcs'];
  if (dst !== null && typeof dst !== 'string') throw new Error(`L${line}: dst 가 이름도 null 도 아니다`);
  if (mem !== null && typeof mem !== 'string') throw new Error(`L${line}: mem 이 이름도 null 도 아니다`);
  if (imm !== null && typeof imm !== 'number') throw new Error(`L${line}: imm 이 수도 null 도 아니다`);
  if (!Array.isArray(srcsRaw) || srcsRaw.some((s) => typeof s !== 'string')) {
    throw new Error(`L${line}: srcs 가 이름 목록이 아니다`);
  }
  const srcs = srcsRaw as string[];
  const ins: Ins = { op, dst, srcs: [...srcs], mem, imm };
  const shapeOk =
    op === 'load'
      ? dst !== null && srcs.length === 0 && mem !== null && imm === null
      : op === 'store'
        ? dst === null && srcs.length === 1 && mem !== null && imm === null
        : op === 'addi'
          ? dst !== null && srcs.length === 1 && mem === null && imm !== null
          : dst !== null &&
            mem === null &&
            ((srcs.length === 2 && imm === null) || (srcs.length === 1 && imm !== null));
  if (!shapeOk) throw new Error(`L${line}: ${op} 의 칸 모양이 맞지 않는다`);
  return ins;
}

/** 명령 열을 좁힌다. 비었거나 모양이 틀리면 던진다. */
export function narrowProgram(raw: unknown): Ins[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('program 이 비었거나 목록이 아니다');
  return raw.map((r, i) => narrowIns(r, i + 1));
}

/**
 * 값 목록 — 정의 차례. 두 번 정의 · 정의 전에 읽음 · 한 번도 읽히지 않음은 던진다.
 * 장면과 그림이 같은 함수를 불러 마디 차례를 얻는다.
 */
export function valueOrder(prog: readonly Ins[]): string[] {
  const defined = new Set<string>();
  const read = new Set<string>();
  const order: string[] = [];
  prog.forEach((ins, i) => {
    for (const s of ins.srcs) {
      if (!defined.has(s)) throw new Error(`L${i + 1}: 정의되지 않은 값 ${s} 을 읽는다`);
      read.add(s);
    }
    if (ins.dst !== null) {
      if (defined.has(ins.dst)) throw new Error(`L${i + 1}: ${ins.dst} 을 두 번 정의한다`);
      defined.add(ins.dst);
      order.push(ins.dst);
    }
  });
  for (const v of order) {
    if (!read.has(v)) throw new Error(`한 번도 읽히지 않는 값 ${v}`);
  }
  return order;
}

/** 명령 글자의 토막. `value` 가 있는 토막은 임시 이름이다 — 그림이 그 자리에서 값을 띄운다. */
export type InsPart = { text: string; value: string | null };

function reg(v: string | null, line: number): InsPart {
  if (v === null) throw new Error(`L${line}: 레지스터 칸이 비었다`);
  return { text: v, value: v };
}

function word(text: string): InsPart {
  return { text, value: null };
}

function src(ins: Ins, k: number, line: number): InsPart {
  const s = ins.srcs[k];
  if (s === undefined) throw new Error(`L${line}: ${k + 1} 번째 읽는 칸이 없다`);
  return reg(s, line);
}

function field(v: string | number | null, what: string, line: number): InsPart {
  if (v === null) throw new Error(`L${line}: ${what} 칸이 비었다`);
  return word(String(v));
}

/** 구조에서 명령 글자를 찍는다 — `load t1, a` · `store x, t6` · `add t4, t1, t2`. */
export function insParts(ins: Ins, line: number): InsPart[] {
  switch (ins.op) {
    case 'load':
      return [word('load '), reg(ins.dst, line), word(', '), field(ins.mem, 'mem', line)];
    case 'store':
      return [word('store '), field(ins.mem, 'mem', line), word(', '), src(ins, 0, line)];
    case 'addi':
      return [word('addi '), reg(ins.dst, line), word(', '), src(ins, 0, line), word(', '), field(ins.imm, 'imm', line)];
    case 'add':
    case 'sub':
    case 'mul': {
      const head = [word(`${ins.op} `), reg(ins.dst, line), word(', '), src(ins, 0, line), word(', ')];
      return ins.imm !== null ? [...head, word(String(ins.imm))] : [...head, src(ins, 1, line)];
    }
    default: {
      const never: never = ins.op;
      throw new Error(`L${line}: 모르는 명령 ${String(never)}`);
    }
  }
}

export async function interferenceGraph(context: FacetContext<InterferenceGraphFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<InterferenceGraphFacetData>;
  const prog = narrowProgram(ctx.data.program);
  const values = valueOrder(prog);
  const stepMs = ctx.data.stepMs;

  const rankOf = (v: string): number => {
    const r = values.indexOf(v);
    if (r < 0) throw new Error(`값 목록에 없는 ${v}`);
    return r;
  };
  const sorted = (s: Iterable<string>): string[] => [...s].sort((a, b) => rankOf(a) - rankOf(b));

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 거꾸로 훑기 — live 는 지금 넘을 줄 "뒤에" 산 값
  const live = new Set<string>();
  const edgeKeys = new Set<string>();
  const neighbors = new Map<string, Set<string>>(values.map((v) => [v, new Set<string>()]));
  const neighborsOf = (v: string): Set<string> => {
    const nb = neighbors.get(v);
    if (nb === undefined) throw new Error(`이웃 목록에 없는 ${v}`);
    return nb;
  };
  for (let line = prog.length; line >= 1; line -= 1) {
    if (!(await pause())) return;
    const ins = prog[line - 1];
    if (ins === undefined) throw new Error(`L${line}: 명령이 없다`);
    const after = sorted(live);
    const d = ins.dst;
    const added: [string, string][] = [];
    if (d !== null) {
      for (const v of after) {
        if (v === d) continue;
        const pair: [string, string] = rankOf(d) < rankOf(v) ? [d, v] : [v, d];
        const key = pair.join('|');
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);
        added.push(pair);
        neighborsOf(d).add(v);
        neighborsOf(v).add(d);
      }
      live.delete(d);
    }
    const stayed = new Set(live);
    for (const s of ins.srcs) live.add(s);
    const before = sorted(live);
    const entered = before.filter((v) => !stayed.has(v));
    await ctx.emit({ type: 'scan', payload: { line, def: d, after, before, entered, added } });
  }
  if (live.size > 0) throw new Error(`맨 앞에서 산 값이 남았다: ${sorted(live).join(', ')}`);

  // 칠하기 — 정의 차례로, 이미 칠한 이웃이 쓰지 않은 가장 낮은 번호
  const color = new Map<string, number>();
  for (const v of values) {
    if (!(await pause())) return;
    const nb = neighbors.get(v);
    if (nb === undefined) throw new Error(`이웃 목록에 없는 ${v}`);
    const colored: { value: string; reg: number }[] = [];
    for (const w of sorted(nb)) {
      const r = color.get(w);
      if (r !== undefined) colored.push({ value: w, reg: r });
    }
    const taken = new Set(colored.map((c) => c.reg));
    let k = 1;
    while (taken.has(k)) k += 1;
    color.set(v, k);
    await ctx.emit({ type: 'color', payload: { value: v, reg: k, neighbors: colored } });
  }
}

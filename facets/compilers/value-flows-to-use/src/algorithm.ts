/**
 * value-flows-to-use — 정의-사용 사슬.
 *
 * 곧은 줄 세 주소 코드를 위에서 아래로 읽으며, 이름에 값을 넣는 줄마다 그 값을 읽는 자리를 모은다.
 * 읽는 자리마다 사슬은 그 위로 가장 가까운 같은 이름의 넣기에서 온다. 같은 이름이 다시 넣어지면 앞 값은
 * 거기서 끊긴다 — 한 줄 안에서는 읽기가 넣기보다 먼저다. 넣기가 없는 이름(바깥 값)의 읽기는 사슬에 들지 않는다.
 * 코드를 돌리지 않는다 — 읽기만 한다.
 *
 * 이벤트:
 *   'init' silent — 첫 def 앞에 한 번. 걸음 0 에 바깥 값의 읽기를 얹는다.
 *          payload: { outside: { line: number; slot: Slot }[] }  // 어디서도 넣지 않는 이름을 읽는 칸. 줄 차례, 칸 차례
 *   'def'  silent 아님, 넣는 줄마다 한 걸음.
 *          payload: {
 *            line: number;                       // 넣는 줄 (1 부터)
 *            name: string;                       // 넣는 이름
 *            uses: { line: number; slot: Slot }[]; // 이 값을 읽는 자리. 줄 차례, 한 줄 안에서는 읽는 칸 차례
 *            cut: number | null;                 // 같은 이름을 다시 넣는 다음 줄. 없으면 null
 *            end: { chains: number } | null;     // 마지막 넣기에만 — 사슬 총수. 그 밖에는 null
 *          }
 *   Slot = 'l' | 'r' | 'src' | 'cond' | 'value' — 명령 안에서 읽는 칸의 이름
 *
 * 걸음 0 은 initial() 이 코드에서 세운다 (셈하기 전의 코드, 사슬 없음). 걸음 0 에 코드가 있으므로 첫 발신 앞에도
 * stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Operand = { var: string } | { num: number };

export type BinOp = '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '>=' | '==' | '!=';

export type Instr =
  | { label: string | null; k: 'bin'; dst: string; l: Operand; op: BinOp; r: Operand }
  | { label: string | null; k: 'copy'; dst: string; src: Operand }
  | { label: string | null; k: 'ifnot'; cond: string; target: string }
  | { label: string | null; k: 'goto'; target: string }
  | { label: string | null; k: 'return'; value: Operand };

export type Slot = 'l' | 'r' | 'src' | 'cond' | 'value';

export type Use = { line: number; slot: Slot };

export type ValueFlowsToUseFacetData = {
  type: 'value-flows-to-use';
  stepMs: number;
  code: Instr[];
};

const OPS: readonly string[] = ['+', '-', '*', '/', '<', '<=', '>', '>=', '==', '!='];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readName(v: unknown, line: number, what: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`줄 ${line}: ${what} 이름이 비었다`);
  return v;
}

function readOperand(v: unknown, line: number, what: string): Operand {
  if (!isRecord(v)) throw new Error(`줄 ${line}: ${what} 피연산자 모양을 모른다`);
  if (typeof v.var === 'string' && v.var !== '') return { var: v.var };
  if (typeof v.num === 'number' && Number.isFinite(v.num)) return { num: v.num };
  throw new Error(`줄 ${line}: ${what} 피연산자는 var 나 num 이어야 한다`);
}

/** initialData.code 를 명령 목록으로 좁힌다. 모르는 모양은 줄 번호를 담아 던진다. */
export function readCode(raw: unknown): Instr[] {
  if (!Array.isArray(raw)) throw new Error('code 는 명령 목록이어야 한다');
  const code = raw.map((item: unknown, i): Instr => {
    const line = i + 1;
    if (!isRecord(item)) throw new Error(`줄 ${line}: 명령 모양을 모른다`);
    const labelRaw = item.label;
    if (labelRaw !== null && typeof labelRaw !== 'string') throw new Error(`줄 ${line}: 라벨은 글자나 null 이어야 한다`);
    const label = labelRaw;
    switch (item.k) {
      case 'bin': {
        const op = item.op;
        if (typeof op !== 'string' || !OPS.includes(op)) throw new Error(`줄 ${line}: 모르는 연산 ${String(op)}`);
        return {
          label,
          k: 'bin',
          dst: readName(item.dst, line, '넣는'),
          l: readOperand(item.l, line, '왼쪽'),
          op: op as BinOp,
          r: readOperand(item.r, line, '오른쪽'),
        };
      }
      case 'copy':
        return { label, k: 'copy', dst: readName(item.dst, line, '넣는'), src: readOperand(item.src, line, '옮기는') };
      case 'ifnot':
        return { label, k: 'ifnot', cond: readName(item.cond, line, '조건'), target: readName(item.target, line, '뜀') };
      case 'goto':
        return { label, k: 'goto', target: readName(item.target, line, '뜀') };
      case 'return':
        return { label, k: 'return', value: readOperand(item.value, line, '돌려주는') };
      default:
        throw new Error(`줄 ${line}: 모르는 명령 ${String(item.k)}`);
    }
  });
  const labels = new Set(code.map((ins) => ins.label).filter((l): l is string => l !== null));
  code.forEach((ins, i) => {
    if ((ins.k === 'goto' || ins.k === 'ifnot') && !labels.has(ins.target)) {
      throw new Error(`줄 ${i + 1}: 없는 라벨 ${ins.target} 으로 뛴다`);
    }
  });
  return code;
}

/** 명령이 넣는 이름. 넣지 않으면 null. */
export function defOf(ins: Instr): string | null {
  return ins.k === 'bin' || ins.k === 'copy' ? ins.dst : null;
}

/** 명령 오른쪽에서 이름을 읽는 칸 — 칸 차례대로. 수는 읽기가 아니다. */
export function readsOf(ins: Instr): { slot: Slot; name: string }[] {
  const out: { slot: Slot; name: string }[] = [];
  const push = (slot: Slot, o: Operand): void => {
    if ('var' in o) out.push({ slot, name: o.var });
  };
  switch (ins.k) {
    case 'bin':
      push('l', ins.l);
      push('r', ins.r);
      break;
    case 'copy':
      push('src', ins.src);
      break;
    case 'ifnot':
      out.push({ slot: 'cond', name: ins.cond });
      break;
    case 'return':
      push('value', ins.value);
      break;
    case 'goto':
      break;
  }
  return out;
}

export async function valueFlowsToUse(context: FacetContext<ValueFlowsToUseFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ValueFlowsToUseFacetData>;
  const stepMs = ctx.data.stepMs;
  const code = readCode(ctx.data.code);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 넣는 줄마다 그 값이 닿는 읽기와 끊기는 줄을 모은다.
  const everDefined = new Set(code.map(defOf).filter((d): d is string => d !== null));
  const flows: { line: number; name: string; uses: Use[]; cut: number | null }[] = [];
  const outside: Use[] = [];
  const live = new Map<string, number>(); // 이름 → 지금 살아 있는 값을 넣은 줄 (flows 의 자리)
  for (let i = 0; i < code.length; i += 1) {
    if (ctx.cancelled) return;
    const ins = code[i];
    if (ins === undefined) throw new Error(`줄 ${i + 1}: 명령이 없다`);
    const line = i + 1;
    // 읽기가 먼저다 — 이 줄이 다시 넣는 이름도 오른쪽에서는 앞 값을 읽는다.
    for (const read of readsOf(ins)) {
      if (ctx.cancelled) return;
      const from = live.get(read.name);
      if (from === undefined) {
        if (everDefined.has(read.name)) throw new Error(`줄 ${line}: ${read.name} 을 넣기 전에 읽는다`);
        outside.push({ line, slot: read.slot }); // 바깥 값 — 사슬에 들지 않는다
        continue;
      }
      const flow = flows[from];
      if (flow === undefined) throw new Error(`줄 ${line}: ${read.name} 의 넣기를 찾지 못했다`);
      flow.uses.push({ line, slot: read.slot });
    }
    const d = defOf(ins);
    if (d !== null) {
      const before = live.get(d);
      if (before !== undefined) {
        const old = flows[before];
        if (old === undefined) throw new Error(`줄 ${line}: ${d} 의 앞 넣기를 찾지 못했다`);
        old.cut = line;
      }
      live.set(d, flows.length);
      flows.push({ line, name: d, uses: [], cut: null });
    }
  }

  const chains = flows.reduce((n, f) => n + f.uses.length, 0);
  await ctx.emit({ type: 'init', silent: true, payload: { outside: outside.map((u) => ({ line: u.line, slot: u.slot })) } });

  for (let i = 0; i < flows.length; i += 1) {
    if (!(await pause())) return;
    const flow = flows[i];
    if (flow === undefined) throw new Error(`넣기 ${i + 1} 이 없다`);
    await ctx.emit({
      type: 'def',
      payload: {
        line: flow.line,
        name: flow.name,
        uses: flow.uses.map((u) => ({ line: u.line, slot: u.slot })),
        cut: flow.cut,
        end: i === flows.length - 1 ? { chains } : null,
      },
    });
  }
}

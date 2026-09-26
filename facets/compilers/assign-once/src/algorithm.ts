/**
 * assign-once — 곧은 줄 세 주소 코드를 위에서 아래로 한 줄씩 SSA 로 바꾼다.
 *
 * 판을 매기는 이름 = 코드 안에서 넣어지는 이름 가운데 임시(`tN`)가 아닌 것.
 * 읽기만 하는 이름과 임시는 판이 없다 (ver: null).
 * 한 명령에서 오른쪽(읽는 이름)을 먼저 지금 판으로 바꾸고, 그다음 왼쪽에 새 판을 준다.
 *
 * 이벤트
 * - `init` (silent) — payload `{ names: { name: string; lines: number[] }[] }`
 *   판을 매기는 이름(첫 넣기 차례)과 그 이름을 넣는 줄 번호(1 부터). 걸음 0 의 바탕을 채운다
 * - `rename` — payload `{ line: number; dst: { name: string; ver: number } | null; reads: { name: string; ver: number | null }[];
 *   end: { name: string; ver: number; n: number }[] | null }`
 *   줄 하나를 SSA 로 바꿈. `reads` 는 읽는 자리의 글 차례. 한 줄 = 한 걸음.
 *   `end` 는 마지막 줄에서만 선다 — 판마다 넣은 횟수(판이 생긴 차례). 그 밖의 줄은 null
 *
 * 던지는 것 — 뜀(`ifnot` · `goto`)이 있는 코드(갈래가 있으면 파이가 필요하다 — 이 조각은 곧은 줄만),
 * 넣기 전에 읽는 판 있는 이름, 모르는 명령 모양(readCode).
 *
 * 명령의 모양 · 좁히개 · 글자 찍기(instrTokens)도 여기 둔다 — 장면 · 그림이 이 모듈에서 가져간다 (층 방향 algorithm ← scene ← stage).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Operand = { var: string } | { num: number };

export type Instr =
  | { label: string | null; k: 'bin'; dst: string; l: Operand; op: string; r: Operand }
  | { label: string | null; k: 'copy'; dst: string; src: Operand }
  | { label: string | null; k: 'ifnot'; cond: string; target: string }
  | { label: string | null; k: 'goto'; target: string }
  | { label: string | null; k: 'return'; value: Operand };

const OPS = new Set(['+', '-', '*', '/', '<', '<=', '>', '>=', '==', '!=']);

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readOperand(v: unknown, where: string): Operand {
  if (isRecord(v)) {
    if (typeof v.var === 'string' && v.var !== '') return { var: v.var };
    if (typeof v.num === 'number' && Number.isFinite(v.num)) return { num: v.num };
  }
  throw new Error(`assign-once: ${where} 의 피연산자 모양을 모른다`);
}

function readName(v: unknown, where: string): string {
  if (typeof v === 'string' && v !== '') return v;
  throw new Error(`assign-once: ${where} 의 이름이 비었다`);
}

/** initialData.code 를 명령 목록으로 좁힌다. 모르는 모양은 줄 번호를 담아 던진다. */
export function readCode(data: unknown): Instr[] {
  if (!isRecord(data) || !Array.isArray(data.code)) {
    throw new Error('assign-once: initialData.code 가 명령 목록이 아니다');
  }
  return data.code.map((raw: unknown, i: number): Instr => {
    const where = `줄 ${i + 1}`;
    if (!isRecord(raw)) throw new Error(`assign-once: ${where} 이 명령이 아니다`);
    const label = raw.label === null || raw.label === undefined ? null : readName(raw.label, where);
    switch (raw.k) {
      case 'bin': {
        if (typeof raw.op !== 'string' || !OPS.has(raw.op)) {
          throw new Error(`assign-once: ${where} 의 연산을 모른다`);
        }
        return {
          label,
          k: 'bin',
          dst: readName(raw.dst, where),
          l: readOperand(raw.l, where),
          op: raw.op,
          r: readOperand(raw.r, where),
        };
      }
      case 'copy':
        return { label, k: 'copy', dst: readName(raw.dst, where), src: readOperand(raw.src, where) };
      case 'ifnot':
        return { label, k: 'ifnot', cond: readName(raw.cond, where), target: readName(raw.target, where) };
      case 'goto':
        return { label, k: 'goto', target: readName(raw.target, where) };
      case 'return':
        return { label, k: 'return', value: readOperand(raw.value, where) };
      default:
        throw new Error(`assign-once: ${where} 의 명령 종류를 모른다`);
    }
  });
}

/** 넣는 이름 (없으면 null). */
export function defName(ins: Instr): string | null {
  return ins.k === 'bin' || ins.k === 'copy' ? ins.dst : null;
}

/** 읽는 자리의 이름 — 글에 나오는 차례. */
export function useNames(ins: Instr): string[] {
  const ofOp = (o: Operand): string[] => ('var' in o ? [o.var] : []);
  switch (ins.k) {
    case 'bin':
      return [...ofOp(ins.l), ...ofOp(ins.r)];
    case 'copy':
      return ofOp(ins.src);
    case 'ifnot':
      return [ins.cond];
    case 'goto':
      return [];
    case 'return':
      return ofOp(ins.value);
  }
}

/**
 * 명령 글자의 토막. `def` · `use` 는 판이 붙을 자리다 (`use` 는 useNames 의 차례 번호를 쥔다).
 */
export type Token =
  | { role: 'plain'; text: string }
  | { role: 'def'; name: string }
  | { role: 'use'; name: string; use: number };

export function instrTokens(ins: Instr): Token[] {
  const out: Token[] = [];
  let use = 0;
  const plain = (text: string): void => {
    out.push({ role: 'plain', text });
  };
  const operand = (o: Operand): void => {
    if ('var' in o) out.push({ role: 'use', name: o.var, use: use++ });
    else plain(String(o.num));
  };
  if (ins.label !== null) plain(`${ins.label}: `);
  switch (ins.k) {
    case 'bin':
      out.push({ role: 'def', name: ins.dst });
      plain(' = ');
      operand(ins.l);
      plain(` ${ins.op} `);
      operand(ins.r);
      break;
    case 'copy':
      out.push({ role: 'def', name: ins.dst });
      plain(' = ');
      operand(ins.src);
      break;
    case 'ifnot':
      plain('ifnot ');
      out.push({ role: 'use', name: ins.cond, use: use++ });
      plain(` goto ${ins.target}`);
      break;
    case 'goto':
      plain(`goto ${ins.target}`);
      break;
    case 'return':
      plain('return ');
      operand(ins.value);
      break;
  }
  return out;
}


export type AssignOnceFacetData = {
  type: 'assign-once';
  stepMs: number;
  code: Instr[];
};

const TEMP = /^t\d+$/;

export async function assignOnce(context: FacetContext<AssignOnceFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<AssignOnceFacetData>;
  const stepMs = ctx.data.stepMs;
  const code = readCode(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 판을 매기는 이름 — 첫 넣기 차례, 넣는 줄 목록
  const names = new Map<string, number[]>();
  code.forEach((ins, i) => {
    if (ins.k === 'ifnot' || ins.k === 'goto') {
      throw new Error(`assign-once: 줄 ${i + 1} 이 뜀이다 — 곧은 줄 코드만 판을 하나로 정할 수 있다`);
    }
    const d = defName(ins);
    if (d === null || TEMP.test(d)) return;
    const lines = names.get(d) ?? [];
    lines.push(i + 1);
    names.set(d, lines);
  });

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { names: [...names].map(([name, lines]) => ({ name, lines })) },
  });

  const current = new Map<string, number>();
  // 판마다 넣은 횟수 — 열쇠는 판이 생긴 차례로 쌓인다
  const tally = new Map<string, { name: string; ver: number; n: number }>();
  for (let i = 0; i < code.length; i += 1) {
    // 걸음 0 (셈하기 전의 코드) 을 읽을 틈이 첫 문이다
    if (!(await pause())) return;
    const ins = code[i] as Instr;
    const reads = useNames(ins).map((name) => {
      if (!names.has(name)) return { name, ver: null };
      const ver = current.get(name);
      if (ver === undefined) {
        throw new Error(`assign-once: 줄 ${i + 1} 이 넣기 전의 ${name} 을 읽는다`);
      }
      return { name, ver };
    });
    const d = defName(ins);
    let dst: { name: string; ver: number } | null = null;
    if (d !== null && names.has(d)) {
      const before = current.get(d);
      const ver = before === undefined ? 1 : before + 1;
      current.set(d, ver);
      dst = { name: d, ver };
      const key = `${d}.${ver}`;
      const seen = tally.get(key);
      tally.set(key, { name: d, ver, n: seen === undefined ? 1 : seen.n + 1 });
    }
    const end = i === code.length - 1 ? [...tally.values()] : null;
    await ctx.emit({ type: 'rename', target: `index:${i}`, payload: { line: i + 1, dst, reads, end } });
  }
}

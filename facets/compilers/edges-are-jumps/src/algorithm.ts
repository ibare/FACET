/**
 * edges-are-jumps — 토막과 토막은 무엇으로 이어지는가.
 *
 * 세 주소 코드는 이미 블록으로 나뉘어 있다 (리더 규칙으로 여기서 셈한다). 블록마다 마지막 명령이
 * 다음에 갈 수 있는 블록으로 간선을 낸다. 코드를 돌리지 않는다 — 간선은 적힌 구조다.
 *
 * 이벤트
 *   init   (silent) payload { blocks: { first: number; last: number }[]; written: number }
 *          블록 경계. first · last 는 명령 차례(0 부터). 블록 이름 B1 … 은 이 배열의 차례다.
 *          written = 코드에 적힌 뜀 명령(goto · ifnot) 수.
 *   edges  payload { block: number; line: number;
 *                    out: { to: number; kind: 'jump' | 'fall'; when: 'false' | 'true' | null; back: boolean }[] }
 *          블록 하나의 마지막 명령(line, 0 부터)이 낸 간선. block · to 는 블록 차례(0 부터).
 *          ifnot 은 적힌 뜀(when 'false') 을 먼저, 흘러내림(when 'true') 을 그다음. return 은 out 이 비었다.
 *          back = 목적지 블록 번호가 출발 블록 번호보다 작거나 같다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Operand = { var: string } | { num: number };

export type Instr =
  | { label: string | null; k: 'bin'; dst: string; l: Operand; op: string; r: Operand }
  | { label: string | null; k: 'copy'; dst: string; src: Operand }
  | { label: string | null; k: 'ifnot'; cond: string; target: string }
  | { label: string | null; k: 'goto'; target: string }
  | { label: string | null; k: 'return'; value: Operand };

export type EdgesAreJumpsFacetData = {
  type: 'edges-are-jumps';
  stepMs: number;
  code: Instr[];
};

export type BlockSpan = { first: number; last: number };
export type EdgeOut = { to: number; kind: 'jump' | 'fall'; when: 'false' | 'true' | null; back: boolean };

const OPS = new Set(['+', '-', '*', '/', '<', '<=', '>', '>=', '==', '!=']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readName(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`edges-are-jumps: ${where} 에 이름이 없다`);
  return v;
}

function readOperand(v: unknown, where: string): Operand {
  if (isRecord(v)) {
    if (typeof v.var === 'string' && v.var !== '') return { var: v.var };
    if (typeof v.num === 'number' && Number.isFinite(v.num)) return { num: v.num };
  }
  throw new Error(`edges-are-jumps: ${where} 의 피연산자 모양을 모른다`);
}

/** 명령 목록을 좁힌다. 모르는 모양 · 없는 라벨로의 뜀은 줄 번호(1 부터)를 담아 던진다 (C6). */
export function readProgram(raw: unknown): Instr[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('edges-are-jumps: code 가 비었다');
  const code = raw.map((item: unknown, i): Instr => {
    const where = `줄 ${i + 1}`;
    if (!isRecord(item)) throw new Error(`edges-are-jumps: ${where} 이 명령 모양이 아니다`);
    const label = item.label === null || item.label === undefined ? null : readName(item.label, `${where} 라벨`);
    switch (item.k) {
      case 'bin': {
        if (typeof item.op !== 'string' || !OPS.has(item.op)) throw new Error(`edges-are-jumps: ${where} 의 연산을 모른다`);
        return {
          label,
          k: 'bin',
          dst: readName(item.dst, where),
          l: readOperand(item.l, where),
          op: item.op,
          r: readOperand(item.r, where),
        };
      }
      case 'copy':
        return { label, k: 'copy', dst: readName(item.dst, where), src: readOperand(item.src, where) };
      case 'ifnot':
        return { label, k: 'ifnot', cond: readName(item.cond, where), target: readName(item.target, where) };
      case 'goto':
        return { label, k: 'goto', target: readName(item.target, where) };
      case 'return':
        return { label, k: 'return', value: readOperand(item.value, where) };
      default:
        throw new Error(`edges-are-jumps: ${where} 의 명령 종류를 모른다`);
    }
  });
  const labels = new Set<string>();
  code.forEach((ins, i) => {
    if (ins.label === null) return;
    if (labels.has(ins.label)) throw new Error(`edges-are-jumps: 줄 ${i + 1} 의 라벨이 겹친다`);
    labels.add(ins.label);
  });
  code.forEach((ins, i) => {
    if ((ins.k === 'goto' || ins.k === 'ifnot') && !labels.has(ins.target)) {
      throw new Error(`edges-are-jumps: 줄 ${i + 1} 이 없는 라벨로 뛴다`);
    }
  });
  return code;
}

function lineOfLabel(code: readonly Instr[], label: string): number {
  const at = code.findIndex((ins) => ins.label === label);
  if (at < 0) throw new Error(`edges-are-jumps: 라벨 ${label} 이 없다`);
  return at;
}

/** 리더 규칙 — ① 첫 명령 ② 뜀의 목적지 ③ 뜀 · return 바로 다음. 블록 = 리더에서 다음 리더 앞까지. */
export function blocksOf(code: readonly Instr[]): BlockSpan[] {
  const lead = new Set<number>([0]);
  code.forEach((ins, i) => {
    if (ins.k === 'goto' || ins.k === 'ifnot') {
      lead.add(lineOfLabel(code, ins.target));
      if (i + 1 < code.length) lead.add(i + 1);
    } else if (ins.k === 'return' && i + 1 < code.length) {
      lead.add(i + 1);
    }
  });
  const starts = [...lead].sort((a, b) => a - b);
  return starts.map((first, bi) => {
    const after = starts[bi + 1];
    return { first, last: after === undefined ? code.length - 1 : after - 1 };
  });
}

function blockOfLine(blocks: readonly BlockSpan[], line: number): number {
  const at = blocks.findIndex((b) => b.first <= line && line <= b.last);
  if (at < 0) throw new Error(`edges-are-jumps: 줄 ${line + 1} 이 어느 블록에도 없다`);
  return at;
}

/** 블록 하나의 마지막 명령이 내는 간선. */
export function edgesOf(code: readonly Instr[], blocks: readonly BlockSpan[], b: number): EdgeOut[] {
  const span = blocks[b];
  if (span === undefined) throw new Error(`edges-are-jumps: 블록 ${b + 1} 이 없다`);
  const end = code[span.last];
  if (end === undefined) throw new Error(`edges-are-jumps: 줄 ${span.last + 1} 이 없다`);
  const next = (): EdgeOut => {
    if (b + 1 >= blocks.length) throw new Error(`edges-are-jumps: 줄 ${span.last + 1} 아래로 흘러내릴 블록이 없다`);
    return { to: b + 1, kind: 'fall', when: end.k === 'ifnot' ? 'true' : null, back: false };
  };
  const jump = (target: string, when: 'false' | null): EdgeOut => {
    const to = blockOfLine(blocks, lineOfLabel(code, target));
    return { to, kind: 'jump', when, back: to <= b };
  };
  switch (end.k) {
    case 'goto':
      return [jump(end.target, null)];
    case 'ifnot':
      return [jump(end.target, 'false'), next()];
    case 'return':
      return [];
    case 'bin':
    case 'copy':
      return [next()];
  }
}

export async function edgesAreJumps(ctx: FacetContext<EdgesAreJumpsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<EdgesAreJumpsFacetData>;
  const stepMs = ctx.data.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('edges-are-jumps: stepMs 가 없다');
  const code = readProgram(ctx.data.code);
  const blocks = blocksOf(code);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const written = code.filter((ins) => ins.k === 'goto' || ins.k === 'ifnot').length;
  await ctx.emit({ type: 'init', silent: true, payload: { blocks, written } });

  // 걸음 0 은 나뉜 블록이 이미 읽을 거리라, 첫 간선 앞에도 stepMs 를 둔다.
  for (let b = 0; b < blocks.length; b += 1) {
    if (!(await pause())) return;
    const span = blocks[b];
    if (span === undefined) throw new Error(`edges-are-jumps: 블록 ${b + 1} 이 없다`);
    await ctx.emit({ type: 'edges', payload: { block: b, line: span.last, out: edgesOf(code, blocks, b) } });
  }
}

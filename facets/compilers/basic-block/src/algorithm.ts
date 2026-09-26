/**
 * basic-block — 세 주소 코드를 리더 규칙 셋으로 짚고, 리더 앞에서 잘라 기본 블록으로 나눈다.
 *
 * 코드를 돌리지 않는다. 명령의 구조만 읽는다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   'rule'  payload { rule: 1 | 2 | 3; hits: Array<{ line: number; from: number[] }>; again: number[]; leaders: number }
 *           규칙 하나를 코드 전체에 댄 결과. line 은 리더로 짚인 명령의 0 기반 차례.
 *           from 은 그 줄을 리더로 만든 까닭이 되는 줄들 — 규칙 ② 는 뛰어오는 뜀 줄,
 *           규칙 ③ 은 바로 앞의 뜀 · return 줄, 규칙 ① 은 빈 배열.
 *           again 은 hits 가운데 앞 규칙이 이미 짚은 줄, leaders 는 이 규칙까지 댄 뒤의 리더 수.
 *   'cut'   payload { leaders: number[]; blocks: Array<{ start: number; end: number }> }
 *           리더 앞에서 한꺼번에 자른 결과. 블록은 [start, end) 이고 글 차례다.
 *
 * 걸음 0 은 장면의 initial() 이 initialData 의 명령에서 세운다 (발신 없음).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Operand = { var: string } | { num: number };

export type Instruction =
  | { label: string | null; k: 'bin'; dst: string; l: Operand; op: string; r: Operand }
  | { label: string | null; k: 'copy'; dst: string; src: Operand }
  | { label: string | null; k: 'ifnot'; cond: string; target: string }
  | { label: string | null; k: 'goto'; target: string }
  | { label: string | null; k: 'return'; value: Operand };

export type BasicBlockFacetData = {
  type: 'basic-block';
  stepMs: number;
  code: Instruction[];
};

export type LeaderRule = 1 | 2 | 3;
export type RuleHit = { line: number; from: number[] };
export type BlockRange = { start: number; end: number };

const OPS = new Set(['+', '-', '*', '/', '<', '<=', '>', '>=', '==', '!=']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readName(v: unknown, what: string, at: number): string {
  if (typeof v !== 'string' || v === '') throw new Error(`basic-block: 줄 ${at} 의 ${what} 이름이 없다`);
  return v;
}

function readOperand(v: unknown, at: number): Operand {
  if (!isRecord(v)) throw new Error(`basic-block: 줄 ${at} 의 피연산자 모양을 모른다`);
  if (typeof v.var === 'string' && v.var !== '') return { var: v.var };
  if (typeof v.num === 'number' && Number.isFinite(v.num)) return { num: v.num };
  throw new Error(`basic-block: 줄 ${at} 의 피연산자 모양을 모른다`);
}

/** initialData 의 명령 목록을 좁힌다. 모르는 모양은 줄 번호(1 기반)를 담아 던진다. */
export function readCode(raw: unknown): Instruction[] {
  if (!Array.isArray(raw)) throw new Error('basic-block: code 가 명령 목록이 아니다');
  return raw.map((ins: unknown, i): Instruction => {
    const at = i + 1;
    if (!isRecord(ins)) throw new Error(`basic-block: 줄 ${at} 이 명령이 아니다`);
    const lab = ins.label;
    if (lab !== null && (typeof lab !== 'string' || lab === '')) {
      throw new Error(`basic-block: 줄 ${at} 의 라벨 모양을 모른다`);
    }
    const label = lab as string | null;
    switch (ins.k) {
      case 'bin': {
        if (typeof ins.op !== 'string' || !OPS.has(ins.op)) {
          throw new Error(`basic-block: 줄 ${at} 의 연산 ${String(ins.op)} 을 모른다`);
        }
        return {
          label,
          k: 'bin',
          dst: readName(ins.dst, '넣는', at),
          l: readOperand(ins.l, at),
          op: ins.op,
          r: readOperand(ins.r, at),
        };
      }
      case 'copy':
        return { label, k: 'copy', dst: readName(ins.dst, '넣는', at), src: readOperand(ins.src, at) };
      case 'ifnot':
        return { label, k: 'ifnot', cond: readName(ins.cond, '조건', at), target: readName(ins.target, '뜀 목적지', at) };
      case 'goto':
        return { label, k: 'goto', target: readName(ins.target, '뜀 목적지', at) };
      case 'return':
        return { label, k: 'return', value: readOperand(ins.value, at) };
      default:
        throw new Error(`basic-block: 줄 ${at} 의 명령 ${String(ins.k)} 을 모른다`);
    }
  });
}

function isJump(ins: Instruction): ins is Extract<Instruction, { target: string }> {
  return ins.k === 'goto' || ins.k === 'ifnot';
}

/** 규칙 ② — 뜀이 가리키는 라벨이 붙은 줄. 없는 라벨로의 뜀은 던진다. */
function jumpTargets(code: Instruction[]): RuleHit[] {
  const byLabel = new Map<string, number>();
  code.forEach((ins, i) => {
    if (ins.label === null) return;
    if (byLabel.has(ins.label)) throw new Error(`basic-block: 라벨 ${ins.label} 이 두 번 붙었다 (줄 ${i + 1})`);
    byLabel.set(ins.label, i);
  });
  const from = new Map<number, number[]>();
  code.forEach((ins, i) => {
    if (!isJump(ins)) return;
    const to = byLabel.get(ins.target);
    if (to === undefined) throw new Error(`basic-block: 줄 ${i + 1} 이 없는 라벨 ${ins.target} 로 뛴다`);
    const list = from.get(to) ?? [];
    list.push(i);
    from.set(to, list);
  });
  return [...from.entries()].sort((a, b) => a[0] - b[0]).map(([line, src]) => ({ line, from: src }));
}

/** 규칙 ③ — 뜀 · return 바로 다음 줄. 마지막 줄 다음은 명령이 없다. */
function afterExits(code: Instruction[]): RuleHit[] {
  const hits: RuleHit[] = [];
  for (let i = 0; i + 1 < code.length; i += 1) {
    const k = code[i]!.k;
    if (k === 'goto' || k === 'ifnot' || k === 'return') hits.push({ line: i + 1, from: [i] });
  }
  return hits;
}

export async function basicBlock(ctxBase: FacetContext<BasicBlockFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<BasicBlockFacetData>;
  const stepMs = ctx.data.stepMs;
  const code = readCode(ctx.data.code);
  if (code.length === 0) throw new Error('basic-block: 명령이 하나도 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const leaders = new Set<number>();
  /** 짚인 줄을 리더에 더하고, 이미 리더였던 줄과 더한 뒤의 리더 수를 돌려준다 */
  function mark(hits: RuleHit[]): { again: number[]; leaders: number } {
    const again = hits.filter((h) => leaders.has(h.line)).map((h) => h.line);
    for (const h of hits) leaders.add(h.line);
    return { again, leaders: leaders.size };
  }

  // 걸음 0 은 코드 전체가 이미 보이는 화면이라 첫 발신 앞에서도 읽을 틈을 둔다.
  if (!(await pause())) return;
  const first: RuleHit[] = [{ line: 0, from: [] }];
  await ctx.emit({ type: 'rule', payload: { rule: 1, hits: first, ...mark(first) } });

  if (!(await pause())) return;
  const second = jumpTargets(code);
  await ctx.emit({ type: 'rule', payload: { rule: 2, hits: second, ...mark(second) } });

  if (!(await pause())) return;
  const third = afterExits(code);
  await ctx.emit({ type: 'rule', payload: { rule: 3, hits: third, ...mark(third) } });

  if (!(await pause())) return;
  const sorted = [...leaders].sort((a, b) => a - b);
  const blocks: BlockRange[] = sorted.map((start, n) => ({
    start,
    end: n + 1 < sorted.length ? sorted[n + 1]! : code.length,
  }));
  await ctx.emit({ type: 'cut', payload: { leaders: sorted, blocks } });
}

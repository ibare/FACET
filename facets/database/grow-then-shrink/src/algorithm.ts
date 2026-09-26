/**
 * 부풀었다 줄어든다 — 기본 2단계 잠금에서 한 트랜잭션이 쥔 잠금의 수.
 *
 * 규약 (사양 그대로):
 *   - 기본 2단계 잠금 (엄격하지 않은 것). 규칙은 하나 — 한 번 놓으면 더는 잡지 않는다.
 *   - 읽기(R)는 공유 잠금 S, 쓰기(W)는 배타 잠금 X 를 그 연산 **직전에** 잡는다.
 *     잡기와 그 연산은 한 걸음.
 *   - 일을 다 잡은 걸음이 잠금 지점이다. 그 뒤 **잡은 차례대로** 한 걸음에 하나씩 놓는다.
 *   - 마지막 놓기와 커밋은 한 걸음 (놓기가 커밋 전에 일어난다).
 *   - 다 쓰고 기다린 걸음 = 잠금 지점 걸음 − 그 줄을 쓴 걸음. 잠금 지점 뒤로는 더 세지 않는다.
 *   - 다른 트랜잭션은 없다. 한 줄을 두 번 잡으면 던진다.
 *
 * 이벤트 (모두 silent 아님, 한 걸음 = 사건 하나):
 *   acquire  { row: string; mode: 'S' | 'X'; op: 'R' | 'W'; held: number;
 *              lockPoint: boolean; waited: { row: string; n: number }[] }
 *            잠금을 잡고 그 연산을 한다. held = 잡은 뒤 쥔 수.
 *            waited = 쥔 잠금마다 그 줄을 쓴 뒤 지난 걸음 수 (쥔 차례대로).
 *   release  { row: string; mode: 'S' | 'X'; held: number; slot: number; commit: boolean }
 *            잠금 하나를 놓는다. slot = 놓기 전 쥔 목록에서의 자리 (0 이 가장 먼저 잡은 것).
 *            held = 놓은 뒤 쥔 수. commit = 이 걸음에 이어서 커밋하는가 (마지막 놓기).
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다. 걸음 0 에 읽을 것(할 일 넷)이
 * 있으므로 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GrowThenShrinkOp = { op: 'R' | 'W'; row: string };

export type GrowThenShrinkFacetData = {
  type: 'grow-then-shrink';
  /** 트랜잭션 번호 (T1 의 1) */
  txn: number;
  /** 트랜잭션의 일, 이 차례로 */
  ops: GrowThenShrinkOp[];
  stepMs: number;
};

/** 연산에 필요한 잠금 방식. 모르는 연산은 던진다. */
export function lockModeOf(op: string): 'S' | 'X' {
  if (op === 'R') return 'S';
  if (op === 'W') return 'X';
  throw new Error(`grow-then-shrink: 모르는 연산 ${op}`);
}

/** initialData 를 좁힌다. 모르는 모양이면 던진다. */
function narrowData(data: unknown): { ops: GrowThenShrinkOp[]; stepMs: number } {
  if (typeof data !== 'object' || data === null) throw new Error('grow-then-shrink: 자료가 없다');
  const rec = data as Record<string, unknown>;
  const stepMs = rec['stepMs'];
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 0) {
    throw new Error('grow-then-shrink: stepMs 가 0 이상의 수가 아니다');
  }
  const raw = rec['ops'];
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('grow-then-shrink: 일이 없다');
  const ops = raw.map((o: unknown, i): GrowThenShrinkOp => {
    if (typeof o !== 'object' || o === null) throw new Error(`grow-then-shrink: ${i} 번째 일의 모양이 틀렸다`);
    const item = o as Record<string, unknown>;
    const op = item['op'];
    const row = item['row'];
    if (op !== 'R' && op !== 'W') throw new Error(`grow-then-shrink: ${i} 번째 일의 연산을 모른다`);
    if (typeof row !== 'string' || row === '') throw new Error(`grow-then-shrink: ${i} 번째 일의 줄 이름이 없다`);
    return { op, row };
  });
  return { ops, stepMs };
}

type Held = { row: string; mode: 'S' | 'X'; usedAt: number };

export async function growThenShrink(context: FacetContext<GrowThenShrinkFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<GrowThenShrinkFacetData>;
  const { ops, stepMs } = narrowData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const held: Held[] = [];
  let released = false;
  let step = 0;

  // 늘어나는 단계 — 연산 직전에 잡고, 잡은 걸음에 연산한다.
  for (let i = 0; i < ops.length; i += 1) {
    if (!(await pause())) return;
    const item = ops[i];
    if (item === undefined) throw new Error(`grow-then-shrink: ${i} 번째 일이 없다`);
    const { op, row } = item;
    if (released) throw new Error(`grow-then-shrink: 놓은 뒤에 ${row} 를 잡으려 했다`);
    if (held.some((h) => h.row === row)) throw new Error(`grow-then-shrink: ${row} 를 두 번 잡으려 했다`);
    const mode = lockModeOf(op);
    step += 1;
    held.push({ row, mode, usedAt: step });
    await ctx.emit({
      type: 'acquire',
      target: `node:${row}`,
      payload: {
        row,
        mode,
        op,
        held: held.length,
        lockPoint: i === ops.length - 1,
        waited: held.map((h) => ({ row: h.row, n: step - h.usedAt })),
      },
    });
  }

  // 줄어드는 단계 — 잡은 차례대로 하나씩 놓는다. 마지막 놓기 뒤에 커밋.
  const order = held.map((h) => h.row);
  for (let j = 0; j < order.length; j += 1) {
    if (!(await pause())) return;
    const row = order[j];
    const slot = held.findIndex((h) => h.row === row);
    const gone = held[slot];
    if (row === undefined || gone === undefined) throw new Error(`grow-then-shrink: 쥐지 않은 ${row} 를 놓으려 했다`);
    held.splice(slot, 1);
    released = true;
    await ctx.emit({
      type: 'release',
      target: `node:${row}`,
      payload: { row, mode: gone.mode, held: held.length, slot, commit: j === order.length - 1 },
    });
  }
}

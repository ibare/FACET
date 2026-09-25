/**
 * 프로세스 상태 전이 — 프로세스 하나가 원인 하나를 받을 때마다 옮김표를 따라 한 칸 건너간다.
 *
 * 규약 (사양 그대로):
 *   - 한 걸음 = 원인 하나를 받아 한 칸 건너가기. 걸음 0 = 시작 상태만 (원인 없음, 발신 없음)
 *   - 다음 상태는 옮김표에서 찾는다. 표에 없는 (상태, 원인) 짝이 오면 던진다
 *   - 원인은 주어진 것으로 받는다 — 왜 지금 그 원인이 오는지는 셈하지 않는다
 *   - 틱 · 시각을 쓰지 않는다
 *
 * 이벤트:
 *   - `cross` (silent 아님) — 한 칸 건너갔다
 *       payload: { edge: number; from: string; cause: string; to: string }
 *       edge 는 옮김표(`table`)에서 찾은 줄의 번호. from · cause · to 는 그 줄과 같다
 *
 * 걸음 0 은 이미 읽을 것이 있는 화면(상태 다섯과 길 여섯)이라 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type StateTransitionRow = { from: string; cause: string; to: string };

export type StateTransitionsFacetData = {
  type: 'state-transitions';
  /** 상태 식별자. 표시 이름은 messages 의 label.state.* */
  states: string[];
  /** 시작 상태 */
  start: string;
  /** 옮김표 — (지금 상태, 원인) → 다음 상태 */
  table: StateTransitionRow[];
  /** 차례대로 받는 원인 */
  causes: string[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** 옮김표에서 (지금 상태, 원인) 짝의 줄 번호를 찾는다. 없으면 던진다. */
function findRow(table: StateTransitionRow[], state: string, cause: string, at: number): number {
  const i = table.findIndex((r) => r.from === state && r.cause === cause);
  if (i < 0) {
    throw new Error(`state-transitions: 옮김표에 없는 짝 (${state}, ${cause}) — 원인 ${at} 번째`);
  }
  return i;
}

function checkData(d: StateTransitionsFacetData): void {
  const known = new Set(d.states);
  if (!known.has(d.start)) throw new Error(`state-transitions: 시작 상태 ${d.start} 가 상태 목록에 없다`);
  const seen = new Set<string>();
  for (const r of d.table) {
    if (!known.has(r.from) || !known.has(r.to)) {
      throw new Error(`state-transitions: 옮김표의 줄 (${r.from}, ${r.cause}) → ${r.to} 에 모르는 상태가 있다`);
    }
    const key = `${r.from}\u0000${r.cause}`;
    if (seen.has(key)) throw new Error(`state-transitions: 옮김표에 (${r.from}, ${r.cause}) 짝이 둘이다`);
    seen.add(key);
  }
}

export async function stateTransitions(
  ctx: FacetContext<StateTransitionsFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<StateTransitionsFacetData>;
  const data = rctx.data;
  checkData(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let state = data.start;
  for (let at = 0; at < data.causes.length; at += 1) {
    if (!(await pause())) return;
    const cause = data.causes[at];
    if (cause === undefined) throw new Error(`state-transitions: 원인 ${at} 번째가 비었다`);
    const edge = findRow(data.table, state, cause, at);
    const row = data.table[edge];
    if (row === undefined) throw new Error(`state-transitions: 옮김표 줄 ${edge} 가 없다`);
    await rctx.emit({ type: 'cross', payload: { edge, from: row.from, cause: row.cause, to: row.to } });
    state = row.to;
  }
}

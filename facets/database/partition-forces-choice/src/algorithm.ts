/**
 * partition-forces-choice — 네트워크가 갈라진 동안 끊긴 쪽 노드에 온 읽기 하나가
 * 두 결말(거절 · 옛 값)로 갈라진다.
 *
 * 규약 (사양 그대로)
 *   - 처음에는 모든 노드가 서로 이어져 있다 (모든 쌍이 이음 하나).
 *   - 갈라짐은 무리 둘로 준다. 다른 무리에 속한 두 노드 사이 이음이 끊긴다. 끝까지 붙지 않는다.
 *   - 쓰기는 받은 노드와, 그 노드에서 끊기지 않은 이음으로 닿는 노드에만 적힌다.
 *     끊긴 이음으로는 아무것도 건너가지 않는다.
 *   - 고름 C = 최신인지 확인할 수 없으면(물어볼 노드가 하나도 닿지 않으면) 답하지 않는다 (오류).
 *   - 고름 A = 가진 값으로 답한다.
 *   - 두 갈래는 **같은 한 읽기**의 두 결말이다. 읽기는 한 번만 온다.
 *
 * 이벤트 (모두 silent 아님 — 한 걸음 = 사건 하나)
 *   cut     { severed: [string, string][] }
 *             끊긴 이음 (노드 쌍). 노드 차례는 initialData.nodes 의 차례
 *   write   { node: string; key: string; value: number; reached: string[]; blocked: string[] }
 *             reached = 값이 적힌 노드 (받은 노드 포함), blocked = 끊긴 이음 너머라 닿지 못한 노드
 *   read    { node: string; key: string; asked: string[]; reachable: string[] }
 *             asked = 물어보려는 다른 노드 전부, reachable = 그중 이음이 살아 있는 노드
 *   refuse  { node: string; key: string }
 *             고름 C 갈래 — 확인할 수 없어 답하지 않는다
 *   answer  { node: string; key: string; value: number; latest: number }
 *             고름 A 갈래 — 가진 값으로 답한다. latest 는 마지막으로 쓰인 값
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (셋 다 같은 값, 모두 이어짐).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PartitionForcesChoiceFacetData = {
  type: 'partition-forces-choice';
  stepMs: number;
  /** 읽고 쓰는 열쇠 이름 (자료, 번역하지 않는다) */
  key: string;
  nodes: { id: string; value: number }[];
  /** 갈라진 뒤의 무리 둘 */
  partition: [string[], string[]];
  write: { node: string; value: number };
  read: { node: string };
};

/** 두 노드 사이 이음이 끊겼는가 — 다른 무리에 속하면 끊긴다. */
export function isSevered(partition: [string[], string[]], a: string, b: string): boolean {
  const sideOf = (id: string): number => {
    if (partition[0].includes(id)) return 0;
    if (partition[1].includes(id)) return 1;
    throw new Error(`partition-forces-choice: 무리에 없는 노드 ${id}`);
  };
  return sideOf(a) !== sideOf(b);
}

export async function partitionForcesChoice(
  ctx0: FacetContext<PartitionForcesChoiceFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<PartitionForcesChoiceFacetData>;
  const { stepMs, key, nodes, partition, write, read } = ctx.data;

  const ids = nodes.map((n) => n.id);
  const known = (id: string, where: string): void => {
    if (!ids.includes(id)) throw new Error(`partition-forces-choice: ${where} 의 모르는 노드 ${id}`);
  };
  for (const id of [...partition[0], ...partition[1]]) known(id, 'partition');
  for (const id of ids) {
    if (!partition[0].includes(id) && !partition[1].includes(id)) {
      throw new Error(`partition-forces-choice: 어느 무리에도 없는 노드 ${id}`);
    }
  }
  known(write.node, 'write');
  known(read.node, 'read');

  // 노드마다 지금 든 값
  const values = new Map<string, number>();
  for (const n of nodes) values.set(n.id, n.value);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 이미 읽을 것이 있는 화면이다 — 첫 발신 앞에 틈을 둔다
  if (!(await pause())) return;

  // 1. 이음이 끊긴다
  const severed: [string, string][] = [];
  for (let i = 0; i < ids.length; i += 1) {
    if (ctx.cancelled) return;
    for (let j = i + 1; j < ids.length; j += 1) {
      if (ctx.cancelled) return;
      const a = ids[i];
      const b = ids[j];
      if (a === undefined || b === undefined) throw new Error('partition-forces-choice: 노드 차례가 비었다');
      if (isSevered(partition, a, b)) severed.push([a, b]);
    }
  }
  await ctx.emit({ type: 'cut', payload: { severed } });
  if (!(await pause())) return;

  // 2. 쓰기가 한쪽에만 퍼진다
  const reached: string[] = [];
  const blocked: string[] = [];
  for (const id of ids) {
    if (ctx.cancelled) return;
    if (id === write.node || !isSevered(partition, write.node, id)) {
      reached.push(id);
      values.set(id, write.value);
    } else {
      blocked.push(id);
    }
  }
  await ctx.emit({
    type: 'write',
    payload: { node: write.node, key, value: write.value, reached, blocked },
  });
  if (!(await pause())) return;

  // 3. 읽기가 끊긴 쪽 노드에 온다 — 물어볼 수 있는 노드를 센다
  const asked = ids.filter((id) => id !== read.node);
  const reachable = asked.filter((id) => !isSevered(partition, read.node, id));
  await ctx.emit({ type: 'read', payload: { node: read.node, key, asked, reachable } });
  if (!(await pause())) return;

  // 4. 고름 C — 최신인지 확인할 수 없으면 답하지 않는다
  if (reachable.length > 0) {
    throw new Error('partition-forces-choice: 읽은 노드가 다른 노드에 닿는다 — 이 조각의 갈라짐이 아니다');
  }
  await ctx.emit({ type: 'refuse', payload: { node: read.node, key } });
  if (!(await pause())) return;

  // 5. 고름 A — 가진 값으로 답한다 (같은 한 읽기의 다른 결말)
  const held = values.get(read.node);
  if (held === undefined) throw new Error(`partition-forces-choice: ${read.node} 의 값이 없다`);
  await ctx.emit({
    type: 'answer',
    payload: { node: read.node, key, value: held, latest: write.value },
  });
}

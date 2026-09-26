/**
 * key-reorder — 키(이름표)가 있는 목록의 차례가 바뀔 때, React 의 lastPlacedIndex
 * 꼴로 무엇을 옮기고 무엇을 그대로 두는지 걸음마다 밝힌다.
 *
 * 이벤트
 * - `build-table` — 옛 목록으로 이름표 표(키 → 옛 자리)를 만들었다.
 *   payload: `{ entries: { key: string; oldIndex: number }[] }`. silent 아님.
 * - `process-item` — 새 목록의 자리 하나를 이름표로 찾아 그대로 두거나 옮긴다.
 *   payload: `{ position: number; key: string; oldIndex: number; action: 'stay' | 'move'; lastPlaced: number }`.
 *   `lastPlaced` 는 이 걸음을 처리한 **뒤**의 값이다. silent 아님.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface KeyReorderFacetData {
  type: 'key-reorder';
  oldKeys: string[];
  newKeys: string[];
  stepMs: number;
}

type Action = 'stay' | 'move';

export async function keyReorder(ctx: FacetContext<KeyReorderFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<KeyReorderFacetData>;
  const { oldKeys, newKeys, stepMs } = rc.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  // 걸음 0(실제 줄 · 새 목록 차례)이 이미 읽을 것이 있는 화면이라, 첫 발신 앞에도
  // stepMs 를 두어 읽을 틈을 준다.
  if (!(await pause())) return;

  const keyTable = new Map<string, number>();
  for (let i = 0; i < oldKeys.length; i += 1) {
    const key = oldKeys[i];
    if (key === undefined) throw new Error(`key-reorder: oldKeys[${i}] 가 비어 있다`);
    if (keyTable.has(key)) throw new Error(`key-reorder: 키 "${key}" 가 옛 목록에서 겹친다`);
    keyTable.set(key, i);
  }

  const entries = oldKeys.map((key, oldIndex) => ({ key, oldIndex }));
  await ctx.emit({ type: 'build-table', payload: { entries } });
  if (!(await pause())) return;

  let lastPlaced = 0;
  for (let position = 0; position < newKeys.length; position += 1) {
    if (rc.cancelled) return;
    const key = newKeys[position];
    if (key === undefined) throw new Error(`key-reorder: newKeys[${position}] 가 비어 있다`);
    const oldIndex = keyTable.get(key);
    if (oldIndex === undefined) {
      throw new Error(`key-reorder: 키 "${key}" 를 이름표 표에서 찾지 못했다 (새 자리 ${position})`);
    }
    const action: Action = oldIndex < lastPlaced ? 'move' : 'stay';
    if (action === 'stay') lastPlaced = oldIndex;

    await ctx.emit({
      type: 'process-item',
      payload: { position, key, oldIndex, action, lastPlaced },
    });
    if (!(await pause())) return;
  }
}

/**
 * keyed-reconciliation — 노드를 자리로 맞추는가 키로 맞추는가.
 *
 * 손잡이 둘(키 모드 · 목록 바뀜)이 바뀔 때마다 한 판을 끝까지 재생하고 `waitForInput` 에서
 * 다음 손잡이 값을 받는다 (reactive).
 *
 * 이벤트 (전부 리터럴 `type`):
 *   'round-start' — payload: { oldItems: string[]; newItems: string[]; oldTag: 'ul'|'ol';
 *                    newTag: 'ul'|'ol'; checkedItem: string; checkedSlot: string;
 *                    keyModeId: string; changeId: string }
 *                    silent: 아니오 — 판이 시작되어 옛 목록 · 새 목록 미리보기 · 실제 목록을 다시 그린다.
 *                    `checkedSlot` 은 눌린 칸이 붙어 있는 물리 노드의 정체성
 *                    (`p:<자리번호>` 또는 `k:<키 문자열>`) — 이 자리에 없으면(retag) 다음 판에서
 *                    떼어질 노드다.
 *   'phase'       — payload: { phase: 'compare-tag'|'patch'|'create'|'delete'|'move' }
 *                    silent: 예 — 코드 패널 하이라이트 전용.
 *   'step'        — payload: 아래 넷 중 하나. silent: 아니오.
 *     { kind: 'patch'; slot: string; atIndex: number; text: string }
 *     { kind: 'create'; slot: string; atIndex: number; text: string; branch?: true }
 *     { kind: 'delete'; slots: string[]; branch?: true }
 *     { kind: 'move'; slot: string; fromIndex: number; toIndex: number; text: string }
 *   'round-end'   — payload: {}. silent: 아니오 — 판이 끝났다(다음 입력을 기다린다).
 *
 * phase 어휘 (algorithm 과 irs.ts 가 정확히 같다): compare-tag · patch · create · delete · move.
 *
 * 계기(누적 채널, C5): patched · created · deleted · moved. 판이 바뀌는 자리에서 0 으로 되돌리고,
 * 처음 한 번은 차이가 0 이어도 보낸다.
 *
 * 노드 정체성(`slot`): 키 모드가 '자리 번호'/'없음'이면(또는 태그가 바뀌는 판이면) `p:<자리번호>`
 * (같은 자리 = 같은 물리 노드). 키 모드가 '고유 키'고 태그가 같으면 `k:<문자열>` (같은 값 = 같은
 * 물리 노드, 자리가 바뀌어도 따라간다).
 */
import type { FacetContext } from '@ffacet/core/runtime';
import type { ReactiveContext } from '@ffacet/core/runtime';

export type KeyedReconciliationData = {
  type: 'keyedReconciliation';
  stepMs: number;
  oldItems: string[];
  checkedItem: string;
  keyModeIds: string[];
  changeIds: string[];
};

type MetricName = 'patched' | 'created' | 'deleted' | 'moved';

function computeNewItems(oldItems: string[], changeId: string): string[] {
  switch (changeId) {
    case 'prepend':
      return ['x', ...oldItems];
    case 'append':
      return [...oldItems, 'x'];
    case 'remove-first':
      return oldItems.slice(1);
    case 'reverse':
      return [...oldItems].reverse();
    case 'retag':
      return [...oldItems];
    default:
      throw new Error(`알 수 없는 목록 바뀜: ${changeId}`);
  }
}

export const keyedReconciliationAlgorithm = async (
  ctx: FacetContext<KeyedReconciliationData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<KeyedReconciliationData>;
  const { oldItems, checkedItem, keyModeIds, changeIds, stepMs } = rc.data;

  const shown: Record<MetricName, number> = { patched: 0, created: 0, deleted: 0, moved: 0 };
  const setMetric = (name: MetricName, next: number): void => {
    const delta = next - shown[name];
    ctx.metric(name, delta);
    shown[name] = next;
  };
  const resetMetrics = (): void => {
    setMetric('patched', 0);
    setMetric('created', 0);
    setMetric('deleted', 0);
    setMetric('moved', 0);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판(키 모드 × 목록 바뀜 조합)을 끝까지 재생한다. 취소되면 false. */
  const runRound = async (keyModeId: string, changeId: string): Promise<boolean> => {
    const newItems = computeNewItems(oldItems, changeId);
    const oldTag: 'ul' | 'ol' = 'ul';
    const newTag: 'ul' | 'ol' = changeId === 'retag' ? 'ol' : 'ul';
    const sameTag = oldTag === newTag;
    const keyed = sameTag && keyModeId === 'id';

    resetMetrics();

    const checkedIndex = oldItems.indexOf(checkedItem);
    if (checkedIndex < 0) throw new Error(`checkedItem '${checkedItem}' 이 oldItems 에 없다`);
    const checkedSlot = keyed ? `k:${checkedItem}` : `p:${checkedIndex}`;

    await ctx.emit({
      type: 'round-start',
      payload: { oldItems, newItems, oldTag, newTag, checkedItem, checkedSlot, keyModeId, changeId },
    });
    if (!(await rc.sleep(stepMs))) return false;

    if (!sameTag) {
      await phase('compare-tag');
      if (!(await rc.sleep(stepMs))) return false;

      const deleteCount = 2 * oldItems.length + 1;
      const slots = oldItems.map((_, i) => `p:${i}`);
      await phase('delete');
      await ctx.emit({ type: 'step', payload: { kind: 'delete', slots, branch: true } });
      setMetric('deleted', deleteCount);
      if (!(await rc.sleep(stepMs))) return false;

      let created = 0;
      for (let i = 0; i < newItems.length; i += 1) {
        if (ctx.cancelled) return false;
        const count = i === 0 ? 3 : 2;
        created += count;
        await phase('create');
        await ctx.emit({
          type: 'step',
          payload: { kind: 'create', slot: `p:${i}`, atIndex: i, text: newItems[i], branch: i === 0 },
        });
        setMetric('created', created);
        if (!(await rc.sleep(stepMs))) return false;
      }
      return true;
    }

    if (!keyed) {
      const minLen = Math.min(oldItems.length, newItems.length);
      let patched = 0;
      for (let i = 0; i < Math.max(oldItems.length, newItems.length); i += 1) {
        if (ctx.cancelled) return false;
        if (i < minLen) {
          if (oldItems[i] !== newItems[i]) {
            patched += 1;
            await phase('patch');
            await ctx.emit({ type: 'step', payload: { kind: 'patch', slot: `p:${i}`, atIndex: i, text: newItems[i] } });
            setMetric('patched', patched);
            if (!(await rc.sleep(stepMs))) return false;
          }
        } else if (i >= oldItems.length) {
          await phase('create');
          await ctx.emit({ type: 'step', payload: { kind: 'create', slot: `p:${i}`, atIndex: i, text: newItems[i] } });
          setMetric('created', 2 * (i - oldItems.length + 1));
          if (!(await rc.sleep(stepMs))) return false;
        }
      }
      if (oldItems.length > newItems.length) {
        const leftover: string[] = [];
        for (let i = newItems.length; i < oldItems.length; i += 1) leftover.push(`p:${i}`);
        await phase('delete');
        await ctx.emit({ type: 'step', payload: { kind: 'delete', slots: leftover } });
        setMetric('deleted', 2 * leftover.length);
        if (!(await rc.sleep(stepMs))) return false;
      }
      return true;
    }

    // 키가 있다 — React 의 lastPlacedIndex 꼴.
    const usedOut = new Array(oldItems.length).fill(0) as number[];
    let last = 0;
    let created = 0;
    let moved = 0;
    for (let i = 0; i < newItems.length; i += 1) {
      if (ctx.cancelled) return false;
      let found = -1;
      for (let j = 0; j < oldItems.length; j += 1) {
        if (usedOut[j] === 0 && oldItems[j] === newItems[i]) {
          found = j;
          break;
        }
      }
      if (found >= 0) {
        usedOut[found] = 1;
        // 코드 패널의 "옮겨야 하는가" 줄은 짝지어진 항목마다 실행된다 — 실제로
        // 옮기는 경우만이 아니라 "제자리라 안 옮긴다" 로 갈릴 때도 이 줄이 실행되므로
        // phase 는 그 결정 자체에 붙인다(걸음/계기는 실제로 옮길 때만).
        await phase('move');
        if (found < last) {
          moved += 1;
          await ctx.emit({
            type: 'step',
            payload: { kind: 'move', slot: `k:${newItems[i]}`, fromIndex: found, toIndex: i, text: newItems[i] },
          });
          setMetric('moved', moved);
          if (!(await rc.sleep(stepMs))) return false;
        } else {
          last = found;
        }
      } else {
        created += 2;
        await phase('create');
        await ctx.emit({ type: 'step', payload: { kind: 'create', slot: `k:${newItems[i]}`, atIndex: i, text: newItems[i] } });
        setMetric('created', created);
        if (!(await rc.sleep(stepMs))) return false;
      }
    }
    const leftoverSlots: string[] = [];
    for (let j = 0; j < oldItems.length; j += 1) if (usedOut[j] === 0) leftoverSlots.push(`k:${oldItems[j]}`);
    if (leftoverSlots.length > 0) {
      await phase('delete');
      await ctx.emit({ type: 'step', payload: { kind: 'delete', slots: leftoverSlots } });
      setMetric('deleted', 2 * leftoverSlots.length);
      if (!(await rc.sleep(stepMs))) return false;
    }
    return true;
  };

  let keyModeIndex = 0;
  let changeIndex = 0;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const keyModeId = keyModeIds[keyModeIndex];
      const changeId = changeIds[changeIndex];
      if (typeof keyModeId !== 'string' || typeof changeId !== 'string') {
        throw new Error('키 모드 · 목록 바뀜 사다리 색인이 범위를 벗어났다');
      }
      const ok = await runRound(keyModeId, changeId);
      if (!ok) return;
      if (ctx.cancelled) return;
      await ctx.emit({ type: 'round-end', payload: {} });

      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'keyMode') {
          const p = input.payload as { value?: unknown } | undefined;
          if (typeof p?.value !== 'number' || keyModeIds[p.value] === undefined) continue;
          keyModeIndex = p.value;
          break;
        }
        if (input.type === 'change') {
          const p = input.payload as { value?: unknown } | undefined;
          if (typeof p?.value !== 'number' || changeIds[p.value] === undefined) continue;
          changeIndex = p.value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
};

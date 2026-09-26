/**
 * 이벤트
 * - write { name: 'left' | 'top'; value: number; overwritten: boolean;
 *           previousValue: number | null; alreadyScheduled: boolean }
 *   처리기가 상태 하나를 곧바로 그리지 않고 모아 두는 자리에 쓴다.
 *   overwritten 은 그 자리에 이미 값이 있어 덮어썼는지, previousValue 는 덮인 옛
 *   값(없으면 null), alreadyScheduled 는 이 쓰기 전에 이미 그리기가 걸려 있었는지
 *   (silent: false)
 * - flush {} — 처리기가 끝나 모아 둔 것을 상태에 넣고 한 번 그린다 (silent: false)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface CoalesceUpdatesFacetData {
  type: 'coalesce-updates';
  /** pseudo-notation 그대로의 처리기 몸 넉 줄. 코드의 낱말이라 자료다 (번역하지 않는다). */
  code: string[];
  /** 처리기가 실행되기 전, 화면에 이미 서 있는 상태. */
  initial: { left: number; top: number };
  /** 처리기가 차례로 쓰는 상태. 이름은 code 의 줄과 대응한다. */
  writes: Array<{ name: 'left' | 'top'; value: number }>;
  stepMs: number;
}

export async function coalesceUpdates(
  ctx: FacetContext<CoalesceUpdatesFacetData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<CoalesceUpdatesFacetData>;
  const { writes, stepMs } = rc.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  // 걸음 0 은 바탕 구조(처리기 코드 · 처음 상태)가 이미 읽을 것이라, 첫 발신 앞에
  // stepMs 를 두어 읽을 틈을 준다.
  if (!(await pause())) return;

  const pending = new Map<string, number>();
  let scheduled = false;

  for (const w of writes) {
    if (rc.cancelled) return;
    const overwritten = pending.has(w.name);
    const previousValue = pending.get(w.name) ?? null;
    const alreadyScheduled = scheduled;
    pending.set(w.name, w.value);
    scheduled = true;
    await rc.emit({
      type: 'write',
      payload: { name: w.name, value: w.value, overwritten, previousValue, alreadyScheduled },
    });
    if (!(await pause())) return;
  }

  if (rc.cancelled) return;
  await rc.emit({ type: 'flush', payload: {} });
  if (!(await pause())) return;
}

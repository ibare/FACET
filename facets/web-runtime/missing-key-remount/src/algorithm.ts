/**
 * missingKeyRemount — 이름표(키) 없는 목록의 맨 앞에 항목 하나를 넣으면 실제 줄이
 * 어떻게 맞춰지는가.
 *
 * 이벤트
 *   'patch'  { index: number; from: string; to: string }
 *     같은 자리(index)의 li 를 같은 종류로 보고 노드를 그대로 둔 채 text 만 고친다.
 *     silent 아님.
 *   'create' { index: number; text: string }
 *     새 목록이 옛 목록보다 길어 남는 자리에 새 li(그 안 input 포함)를 만든다.
 *     silent 아님.
 *
 * 두 이벤트 다 옛 목록과 새 목록을 같은 자리끼리 맞추는 것 말고는 아무 연산도
 * 하지 않는다 — 이 조각의 요점이 "옮김이 없다" 이므로 자리 계산(lastPlaced 등)
 * 자체가 없다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 이름표 없는 목록 하나의 재조정. 자료는 전부 옛 목록·새 목록의 항목 글자다. */
export type MissingKeyRemountFacetData = {
  type: 'missingKeyRemount';
  /** 옛 목록 (키 없음). 자리 차례대로. */
  oldItems: string[];
  /** 새 목록 (키 없음). 자리 차례대로. */
  newItems: string[];
  /** 실제 쪽에서 살아 있는 상태 — 이 옛 자리의 li 안 input 이 눌려 있다. */
  checkedOldIndex: number;
  /** 걸음 하나(운동 + 이 시간) 뒤 다음 자리로. */
  stepMs: number;
};

export async function missingKeyRemount(ctx: FacetContext<MissingKeyRemountFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<MissingKeyRemountFacetData>;
  const { oldItems, newItems, stepMs } = rc.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  // 걸음 0(옛 줄과 눌린 칸)은 이미 읽을 것이 있는 화면이라, 첫 발신 앞에 stepMs 를 두어
  // 읽을 틈을 준다.
  if (!(await pause())) return;

  for (let index = 0; index < newItems.length; index += 1) {
    if (rc.cancelled) return;
    if (index < oldItems.length) {
      await rc.emit({ type: 'patch', payload: { index, from: oldItems[index], to: newItems[index] } });
    } else {
      await rc.emit({ type: 'create', payload: { index, text: newItems[index] } });
    }
    if (!(await pause())) return;
  }
}

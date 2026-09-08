/**
 * sort-stability — 정렬 안정성 조각의 algorithm.
 *
 * 답하는 질문: **값이 같은 둘의 앞뒤 순서가 정렬 뒤에도 지켜지는가.**
 *
 * 이 조각은 정렬 과정을 보이지 않는다. 보이는 것은 **같은 입력에서 갈라져 나온
 * 두 결과**이고, 그 둘이 값으로는 구별되지 않으며 오직 "어디서 왔는가" 로만
 * 어긋난다는 사실이다. 그래서 algorithm 은 견줌·맞바꿈을 걸음마다 발신하지 않고,
 * 두 정렬의 **결과 순서**를 각각 셈해 한 걸음씩 내놓는다.
 *
 * ── 이벤트 목록 (전부 facet 고유 확장, 전부 step boundary — silent 없음)
 *
 * | type            | payload                                | 뜻 |
 * |-----------------|----------------------------------------|----|
 * | `sort-stable`   | `{ order: string[] }`                  | 안정 정렬 결과의 이름표 차례. 항목이 입력 줄에서 위 결과 줄로 옮겨 앉는다 |
 * | `sort-selection`| `{ order: string[] }`                  | 선택 정렬 결과의 이름표 차례. 아래 결과 줄로 옮겨 앉는다 |
 * | `tags-hidden`   | 없음                                    | 두 결과 줄의 이름표를 접는다. 값만 남으면 두 줄이 똑같이 읽힌다 |
 * | `link-origin`   | 없음                                    | 이름표를 도로 펴고 같은 항목끼리 실을 잇는다 |
 * | `mark-mismatch` | `{ labels: string[]; value: number }`  | 두 결과에서 자리가 어긋난 항목들과 그들의 공통 값 |
 * | `rewind`        | 없음                                    | 처음 상태로 되감는다 (advance 로 되짚어 볼 때) |
 *
 * ── 진행
 *
 * `mechanismKind: 'reactive'`. mount 직후 스스로 자동 재생하고 (`ctx.sleep(stepMs)`),
 * 끝나면 `waitForInput()` 으로 멈춰 선다. control-bar 의 `advance` 가 들어오면
 * 되감은 뒤 첫 걸음까지 보이고, 그다음부터 한 걸음씩 나아간다 (S-piece).
 *
 * 메트릭 없음 — 조각은 셀 것이 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SortStabilityItem = {
  /** 값이 같은 둘을 구별하는 이름표. 화면이 들고 있어야 하는 "값이 아닌 것". */
  label: string;
  value: number;
};

export type SortStabilityData = {
  type: 'sort-stability';
  items: SortStabilityItem[];
  /** 걸음 사이 간격. 읽을 시간을 주는 일은 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

const FALLBACK_STEP_MS = 900;

/**
 * 안정된 결과. 값이 같으면 입력에서의 자리를 그대로 tiebreak 로 쓴다 —
 * 이것이 "안정" 의 정의 자체다.
 */
/**
 * `advance` 가 올 때까지 기다린다. 다른 입력은 흘려보낸다 — 컨트롤이 replay 와
 * advance 뿐이라 지금은 무해하지만, 걸음을 옮기는 것은 advance 하나여야 한다.
 * 취소되면 waitForInput 이 reject 한다.
 */
async function waitForAdvance(rc: ReactiveContext<SortStabilityData>): Promise<void> {
  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput();
    if (input.type === 'advance') return;
  }
}

export function stableResultOrder(items: readonly SortStabilityItem[]): string[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.value - b.item.value || a.index - b.index)
    .map((entry) => entry.item.label);
}

/**
 * 선택 정렬의 결과. 남은 구간의 최솟값을 찾아 맨 앞과 맞바꾼다.
 * 맞바꿈이 멀리 있는 항목을 끌어오므로 값이 같은 둘의 앞뒤가 뒤집힐 수 있다.
 */
export function selectionResultOrder(items: readonly SortStabilityItem[]): string[] {
  const work = items.slice();
  for (let i = 0; i < work.length - 1; i += 1) {
    let min = i;
    for (let j = i + 1; j < work.length; j += 1) {
      if (work[j].value < work[min].value) min = j;
    }
    if (min !== i) {
      const held = work[i];
      work[i] = work[min];
      work[min] = held;
    }
  }
  return work.map((item) => item.label);
}

/** 두 결과에서 자리가 어긋난 항목의 이름표. 안정된 쪽의 차례로 모은다. */
function mismatchedLabels(stable: readonly string[], other: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < stable.length; i += 1) {
    if (stable[i] !== other[i]) out.push(stable[i]);
  }
  return out;
}

function valueOf(items: readonly SortStabilityItem[], label: string): number {
  const found = items.find((item) => item.label === label);
  return found ? found.value : 0;
}

export const sortStability = async (ctx: FacetContext<SortStabilityData>): Promise<void> => {
  const rc = ctx as ReactiveContext<SortStabilityData>;
  const items = ctx.data.items;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : FALLBACK_STEP_MS;

  const stable = stableResultOrder(items);
  const selection = selectionResultOrder(items);
  const mismatch = mismatchedLabels(stable, selection);
  const mismatchValue = mismatch.length > 0 ? valueOf(items, mismatch[0]) : 0;

  /**
   * 걸음 사이의 문. 자동 재생이면 stepMs 만큼 쉬고, 되짚어 보는 중이면
   * advance 를 기다린다. 되감기 직후의 첫 문만 그냥 통과시켜, 처음 누른
   * advance 가 "되감고 첫 걸음까지" 보이게 한다 (S-piece).
   */
  let manual = false;
  let passFirstGate = false;
  const gate = async (): Promise<boolean> => {
    if (!manual) return rc.sleep(stepMs);
    if (passFirstGate) {
      passFirstGate = false;
      return !rc.cancelled;
    }
    await waitForAdvance(rc);
    return !rc.cancelled;
  };

  const playOnce = async (): Promise<boolean> => {
    if (!(await gate())) return false;
    await ctx.emit({ type: 'sort-stable', payload: { order: stable } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'sort-selection', payload: { order: selection } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'tags-hidden' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'link-origin' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'mark-mismatch', payload: { labels: mismatch, value: mismatchValue } });

    return !rc.cancelled;
  };

  try {
    if (!(await playOnce())) return;
    manual = true;
    for (;;) {
      await waitForAdvance(rc);
      if (rc.cancelled) return;
      await ctx.emit({ type: 'rewind' });
      passFirstGate = true;
      if (!(await playOnce())) return;
    }
  } catch {
    // waitForInput 은 reset/destroy 때 'cancelled' 로 reject 된다. 조용히 끝낸다.
  }
};

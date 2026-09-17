/**
 * height-balance-check — 균형 인수(balance factor)가 잎에서 뿌리까지 후위
 * 순회로 셈해 올라가는 것을 보인다.
 *
 * 한 자리에 이르면 아래에서 올라온 왼쪽 높이와 오른쪽 높이를 맞대어 빼고, 그
 * 차를 자리에 적은 뒤 자기 높이를 다시 위로 올려보낸다. 재귀 자체가 이 순서를
 * 만든다 — 걸음을 배열로 손으로 적지 않는다 (S-piece).
 *
 * **키와 차이는 싣지 않는다.** 둘 다 나무 모양에서 셀 수 있는 수이고, 화면에는
 * 왼쪽 토큰 · 오른쪽 토큰 · `Δ` 배지로 **나란히** 뜬다. 항이 두 출처에서 오면
 * 언젠가 갈리고, 갈리는 날 화면이 스스로 거짓이 된다. 그래서 여기서는 어느
 * 자리의 셈이 끝났는지만 말하고, 수는 `scene.ts` 의 `childHeight` 하나가 낸다.
 *
 * 이벤트 어휘 (표준 vocab 외 확장, C2):
 *
 *   'node-settle' — 한 노드의 계산이 끝나 화면에 적힐 때.
 *     target:  `node:<value>`
 *     payload: { value: number }
 *     silent:  아니다 — 높이 토큰이 실제로 올라와 자리에 적히는 step boundary.
 *
 *   'rewind' — 자동 재생이 끝난 뒤 처음 받는 `advance` 입력에서, 처음으로
 *              되돌아가며 발신한다 (S-piece).
 *     target:  없음
 *     payload: 없음
 *     silent:  아니다 — 되감김 자체가 눈에 보여야 반응이 있다고 읽힌다.
 *
 * 표준 이벤트 `done` 은 쓰지 않는다 — 마지막 노드(뿌리)의 `node-settle` 이
 * 이미 화면에 여섯 자리를 전부 드러내므로, 완료를 따로 알릴 것이 없다.
 */

import type { FacetContext } from '@ffacet/core/runtime';
import type { ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 이진 트리 노드 선언. 왼/오 자식이 없으면 필드 자체를 생략한다 (높이 0 취급). */
export type TreeNodeSpec = {
  value: number;
  left?: TreeNodeSpec;
  right?: TreeNodeSpec;
};

export type HeightBalanceCheckData = {
  type: 'height-balance-check';
  root: TreeNodeSpec;
  /** 걸음 사이 읽을 시간 (ms). 저작 결정 (S-piece). */
  stepMs: number;
};

/**
 * 후위 순회가 자리를 밟는 차례. 실제 재귀가 그 차례를 만들어 낸다 (잎 → 뿌리).
 *
 * 키는 재귀 안에서 위로 올려보내는 데만 쓰고 밖으로 내보내지 않는다 — 화면이 쓰는
 * 수는 `scene.ts` 가 나무에서 직접 센다.
 */
export function computeHeightBalanceCheckOrder(root: TreeNodeSpec): number[] {
  const order: number[] = [];

  function visit(node: TreeNodeSpec | undefined): number {
    if (!node) return 0;
    const leftHeight = visit(node.left);
    const rightHeight = visit(node.right);
    order.push(node.value);
    return 1 + Math.max(leftHeight, rightHeight);
  }

  visit(root);
  return order;
}

/** 취소 검사와 ctx.sleep 을 묶는다 (S-piece). */
async function pause<T>(ctx: ReactiveContext<T>, ms: number): Promise<boolean> {
  if (ctx.cancelled) return false;
  return ctx.sleep(ms);
}

export async function heightBalanceCheckAlgorithm(
  ctx: FacetContext<HeightBalanceCheckData>,
): Promise<void> {
  const reactive = ctx as ReactiveContext<HeightBalanceCheckData>;
  const { root, stepMs } = reactive.data;
  const order = computeHeightBalanceCheckOrder(root);

  // 1. 자동 재생 — 잎에서 뿌리까지 한 자리씩 셈해 올라간다.
  for (const value of order) {
    if (reactive.cancelled) return;
    await reactive.emit({
      type: 'node-settle',
      target: `node:${value}`,
      payload: { value },
    });
    const ok = await pause(reactive, stepMs);
    if (!ok) return;
  }

  // 2. 자동 재생 종료 — 이제부터는 `advance` 입력이 올 때마다 한 자리씩
  //    다시 짚는다. 첫 입력은 처음으로 되감고 첫 걸음까지 보인다 (S-piece).
  let manualIndex = 0;
  for (;;) {
    // 루프 바디 시작부에서 취소를 본다 (C8). waitForInput 이 reject 하는 것과
    // 별개로, 걸음을 하나 내보낸 직후 취소된 경우를 여기서 잡는다.
    if (reactive.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await reactive.waitForInput();
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다 (C6).
      return;
    }
    if (input.type !== 'advance') continue;

    if (manualIndex === 0) {
      await reactive.emit({ type: 'rewind' });
    }
    const value = order[manualIndex];
    await reactive.emit({
      type: 'node-settle',
      target: `node:${value}`,
      payload: { value },
    });
    manualIndex = (manualIndex + 1) % order.length;
  }
}

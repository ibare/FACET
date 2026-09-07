/**
 * 키 방향의 역전 (signature key direction) 시각화 알고리즘 — 조각(단일 주장) facet.
 *
 * 이 facet 이 답하는 질문 하나:
 *   "암호화와 서명은 같은 키 한 쌍을 쓰는데 왜 방향이 반대인가?"
 *
 * 두 흐름을 위아래로 나란히 놓으면 답이 보인다. 암호화는 누구나 잠그고 주인만
 * 열며, 서명은 주인만 만들고 누구나 확인한다. 키가 교차하고, 그와 함께 "한
 * 사람" 이 서 있는 쪽도 앞에서 뒤로 옮겨 간다.
 *
 * 무엇을 지키려는지가 다르기 때문이다. 암호화는 읽을 수 있는 사람을 하나로
 * 줄이고, 서명은 만들 수 있는 사람을 하나로 줄인다. 하나로 줄이려는 대상이
 * 다르니 개인키가 서는 자리도 반대가 된다.
 *
 * 진행 동력은 ReactiveMechanism. 컨트롤바 없이 스스로 시작하고 걸음 간격도
 * 스스로 정한다 (ctx.sleep).
 *
 * 식별자 (C1): 흐름을 가리키는 곳이 payload 뿐이라 target 을 쓰지 않는다.
 *
 * 이벤트 (C2) — 전부 facet 로컬 (StandardEventType 미포함):
 *   - init             payload: {}
 *   - encryption-flow  payload: {}   누구나 잠그고 주인만 여는 흐름
 *   - signature-flow   payload: {}   주인만 만들고 누구나 확인하는 흐름
 *   - mark-keys        payload: {}   두 흐름에서 키가 교차했음을 잇는다
 *   - mark-who         payload: {}   "한 사람" 이 어느 쪽에 서 있는지
 *
 * 메트릭 (C5): 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SignatureKeyDirectionFacetData = {
  type: 'signature-key-direction';
  /**
   * 한 걸음 사이 머무는 간격 ms.
   *
   * 조각은 컨트롤바가 없어 speed-slider 로 늦출 수 없다 (원칙 2).
   */
  stepMs: number;
};

export async function signatureKeyDirection(
  ctxBase: FacetContext<SignatureKeyDirectionFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<SignatureKeyDirectionFacetData>;
  const { stepMs } = ctx.data;

  /**
   * 걸음 사이 머무름. 취소되면 false — 호출부가 즉시 빠져나가야 한다 (C8).
   *
   * 걸음을 배열로 순회하지 않고 한 줄씩 펴 쓰는 이유는 `ctx.emit` 의 type 이
   * 리터럴이어야 하기 때문이다 (C2). 덕분에 어휘가 코드에 그대로 드러난다.
   */
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    const ok = await ctx.sleep(stepMs);
    return ok && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: {} });

  // 네 걸음. 두 흐름을 각각 세운 뒤에야 교차를 말할 수 있다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'encryption-flow' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'signature-flow' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'mark-keys' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'mark-who' });
}

/**
 * 비둘기집 충돌 (pigeonhole collision) 시각화 알고리즘 — 조각(단일 주장) facet.
 *
 * 이 facet 이 답하는 질문 하나:
 *   "해시 충돌은 왜 반드시 존재하는가?"
 *
 * 답은 확률이 아니라 셈에 있다. 출력 자리가 유한하면, 그 수보다 입력이 하나만
 * 많아도 겹치는 쌍이 반드시 생긴다. 찾기가 어려운 것과 존재하지 않는 것은 다르다.
 *
 * 그래서 화면은 자리를 실제로 다 채운 뒤 하나를 더 넣는다. 16칸을 하나씩 채우는
 * 입력 16개와 17번째 입력은 실측값이다 — SHA-256 의 마지막 니블을 자리 번호로
 * 삼았고, 17번째 'ag' 는 'aa' 가 앉은 6번 자리로 떨어진다.
 *
 * 16칸으로 줄여 보이는 것은 축척일 뿐이다. 실제 SHA-256 은 2^256 칸이고, 수가
 * 클수록 겹치기까지 오래 걸릴 뿐 셈은 같다 — 그 사실을 화면 각주가 말한다.
 *
 * 진행 동력은 ReactiveMechanism. 컨트롤바 없이 스스로 시작하고 (init 의
 * ensureStarted) 걸음 간격도 스스로 정한다 (ctx.sleep). 입력 대기 루프는 두지
 * 않는다 — 네 걸음을 마치면 그대로 끝난다.
 *
 * 식별자 (C1): 자리 번호를 쓰는 곳이 payload 뿐이라 target 을 쓰지 않는다.
 *
 * 이벤트 (C2) — 전부 facet 로컬 (StandardEventType 미포함):
 *   - init             payload: { slotCount, fillers, overflow }
 *   - reveal-slots     payload: {}   빈 자리 N칸을 놓는다
 *   - fill-slots       payload: {}   입력 N개가 자리를 하나씩 채운다
 *   - reveal-overflow  payload: {}   N+1 번째 입력이 등장한다
 *   - place-overflow   payload: {}   갈 곳이 없어 이미 찬 자리에 겹쳐 앉는다
 *
 * 메트릭 (C5): 없다. 조각은 metrics 패널을 두지 않으므로 ctx.metric 을 부르지 않는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 자리 하나를 차지하는 입력. */
export type PigeonholeEntry = {
  /** 입력 문자열. */
  input: string;
  /** 이 입력이 떨어지는 자리 번호 (0..slotCount-1). */
  slot: number;
};

export type PigeonholeFacetData = {
  type: 'pigeonhole';
  /** 출력 자리 수. 실제 해시보다 훨씬 작게 줄여 셈이 보이게 한다. */
  slotCount: number;
  /** 자리를 하나씩 채우는 입력들. 길이가 slotCount 와 같아야 자리가 꽉 찬다. */
  fillers: PigeonholeEntry[];
  /** 자리가 다 찬 뒤 들어오는 입력. 어디에 앉든 이미 누가 있다. */
  overflow: PigeonholeEntry;
  /**
   * 한 걸음 사이 머무는 간격 ms.
   *
   * 조각은 컨트롤바가 없어 speed-slider 로 늦출 수 없다. 읽을 시간을 주는 것은
   * 저작 결정이므로 선언에 둔다 (원칙 2).
   */
  stepMs: number;
};

export async function pigeonholeCollision(
  ctxBase: FacetContext<PigeonholeFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<PigeonholeFacetData>;
  const { slotCount, fillers, overflow, stepMs } = ctx.data;

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

  await ctx.emit({
    type: 'init',
    payload: { slotCount, fillers, overflow },
  });

  // 네 걸음. 자리를 다 채운 다음에야 하나를 더 넣는다 — 순서가 곧 논증이다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'reveal-slots' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'fill-slots' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'reveal-overflow' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'place-overflow' });
}

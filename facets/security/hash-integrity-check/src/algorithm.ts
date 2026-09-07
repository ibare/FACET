/**
 * 무결성 대조 (integrity check) 시각화 알고리즘 — 조각(단일 주장) facet.
 *
 * 이 facet 이 답하는 질문 하나:
 *   "받은 파일이 원본 그대로인지 어떻게 아는가?"
 *
 * 답은 대조다. 원본이 함께 내건 해시 한 줄을 기준으로 두고, 받은 것을 해싱해
 * 같은지 본다. 온전한 것은 기준과 한 글자도 다르지 않고, 손댄 것은 알아볼 수
 * 없을 만큼 달라진다.
 *
 * 눈사태 조각과 답하는 질문이 다르다. 그쪽은 왜 달라지는가를, 이쪽은 그 성질을
 * 어떻게 써먹는가를 말한다. 그래서 화면의 주인공도 비트가 아니라 판정이다.
 *
 * 진행 동력은 ReactiveMechanism. 컨트롤바 없이 스스로 시작하고 (init 의
 * ensureStarted) 걸음 간격도 스스로 정한다 (ctx.sleep).
 *
 * 식별자 (C1): 행을 가리키는 곳이 payload 뿐이라 target 을 쓰지 않는다.
 *
 * 이벤트 (C2) — 전부 facet 로컬 (StandardEventType 미포함):
 *   - init             payload: { referenceHash, intact, tampered, diffIndex }
 *   - reveal-reference payload: {}   원본이 내건 기준 해시를 놓는다
 *   - check-intact     payload: {}   온전한 것을 해싱해 기준과 견준다
 *   - check-tampered   payload: {}   손댄 것을 해싱해 기준과 견준다
 *   - mark-difference  payload: {}   무엇이 달라졌는지 짚는다
 *
 * 메트릭 (C5): 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 받은 것 하나 — 내용과 그 해시. */
export type ReceivedItem = {
  /** 받은 내용. */
  content: string;
  /** 그 내용의 해시 (소문자 hex, 실측값). */
  hash: string;
};

export type HashIntegrityFacetData = {
  type: 'hash-integrity';
  /** 화면에 인쇄할 해시 함수 이름. */
  algorithmLabel: string;
  /** 원본이 함께 내건 해시. intact.hash 와 같아야 한다. */
  referenceHash: string;
  /** 손대지 않은 채 도착한 것. */
  intact: ReceivedItem;
  /** 한 글자가 바뀐 채 도착한 것. */
  tampered: ReceivedItem;
  /**
   * 한 걸음 사이 머무는 간격 ms.
   *
   * 조각은 컨트롤바가 없어 speed-slider 로 늦출 수 없다 (원칙 2).
   */
  stepMs: number;
};

/** 두 문자열이 처음으로 갈라지는 자리. 같으면 -1. */
function firstDiffIndex(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : n;
}

export async function hashIntegrityCheck(
  ctxBase: FacetContext<HashIntegrityFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<HashIntegrityFacetData>;
  const { algorithmLabel, referenceHash, intact, tampered, stepMs } = ctx.data;

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
    payload: {
      algorithmLabel,
      referenceHash,
      intact,
      tampered,
      diffIndex: firstDiffIndex(intact.content, tampered.content),
    },
  });

  // 네 걸음. 기준을 먼저 세우지 않으면 나머지는 대조가 되지 못한다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'reveal-reference' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'check-intact' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'check-tampered' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'mark-difference' });
}

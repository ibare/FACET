/**
 * 해시에 서명하기 (signing the digest) 시각화 알고리즘 — 조각(단일 주장) facet.
 *
 * 이 facet 이 답하는 질문 하나:
 *   "왜 문서 전체가 아니라 그 해시에 서명하는가?"
 *
 * 크기 때문이다. 문서는 얼마든지 커질 수 있지만 해시는 언제나 32바이트이고,
 * 그것에 서명한 결과도 64바이트로 끝난다. 서명의 크기와 계산량이 문서 크기와
 * 무관해진다.
 *
 * 화면은 세로로 내려온다 — 화면을 넘어가는 문서 막대, 점만 한 해시, 조금 큰
 * 서명. 비율 자체가 논증이라 막대 길이를 눈속임하지 않는다.
 *
 * 진행 동력은 ReactiveMechanism. 컨트롤바 없이 스스로 시작하고 걸음 간격도
 * 스스로 정한다 (ctx.sleep).
 *
 * 식별자 (C1): 단계를 가리키는 곳이 payload 뿐이라 target 을 쓰지 않는다.
 *
 * 이벤트 (C2) — 전부 facet 로컬 (StandardEventType 미포함):
 *   - init           payload: { documentBytes, digestBytes, signatureBytes, ... }
 *   - show-document  payload: {}   문서가 놓인다. 막대가 화면을 넘어간다
 *   - hash-it        payload: {}   해시로 접힌다
 *   - sign-it        payload: {}   개인키로 서명한다
 *   - compare        payload: {}   서명 크기가 문서 크기와 무관함을 짚는다
 *
 * 메트릭 (C5): 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SignatureOnHashFacetData = {
  type: 'signature-on-hash';
  /** 화면에 인쇄할 해시 함수 이름. */
  hashLabel: string;
  /** 화면에 인쇄할 서명 방식 이름. */
  signatureLabel: string;
  /** 서명할 문서의 크기 (바이트). */
  documentBytes: number;
  /** 해시 길이 (바이트). SHA-256 이면 32. */
  digestBytes: number;
  /** 서명 길이 (바이트). Ed25519 면 64. */
  signatureBytes: number;
  /**
   * 한 걸음 사이 머무는 간격 ms.
   *
   * 조각은 컨트롤바가 없어 speed-slider 로 늦출 수 없다 (원칙 2).
   */
  stepMs: number;
};

export async function signatureOnHash(
  ctxBase: FacetContext<SignatureOnHashFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<SignatureOnHashFacetData>;
  const { hashLabel, signatureLabel, documentBytes, digestBytes, signatureBytes, stepMs } =
    ctx.data;

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
    payload: { hashLabel, signatureLabel, documentBytes, digestBytes, signatureBytes },
  });

  // 네 걸음. 문서의 크기를 먼저 겪어야 32바이트가 작게 느껴진다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'show-document' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'hash-it' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'sign-it' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'compare' });
}

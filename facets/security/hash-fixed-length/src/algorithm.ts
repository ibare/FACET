/**
 * 고정 길이 출력 (fixed-length digest) 시각화 알고리즘 — 조각(단일 주장) facet.
 *
 * 이 facet 이 답하는 질문 하나:
 *   "한 글자를 넣든 파일을 넣든 왜 결과 길이가 같은가?"
 *
 * 답은 화면의 두 열이 말한다. 왼쪽 입력은 길이가 제각각인데 (0바이트부터 화면
 * 밖으로 넘칠 만큼) 오른쪽 출력 상자는 넷이 정확히 같은 폭이다.
 *
 * 이 조각은 충돌이 왜 불가피한지를 셈하기 전의 전제이기도 하다 — 들어오는 것은
 * 얼마든지 길어질 수 있는데 나가는 것이 늘 같은 길이라면, 어딘가는 겹칠 수밖에 없다.
 *
 * 진행 동력은 ReactiveMechanism. 컨트롤바 없이 스스로 시작하고 (init 의
 * ensureStarted) 걸음 간격도 스스로 정한다 (ctx.sleep).
 *
 * 식별자 (C1): 행을 가리키는 곳이 payload 뿐이라 target 을 쓰지 않는다.
 *
 * 이벤트 (C2) — 전부 facet 로컬 (StandardEventType 미포함):
 *   - init            payload: { algorithmLabel, hashBits, rows }
 *   - reveal-inputs   payload: {}   길이가 제각각인 입력들을 놓는다
 *   - reveal-outputs  payload: {}   각각의 해시를 놓는다
 *   - mark-uniform    payload: {}   출력의 폭이 하나같음을 안내선으로 짚는다
 *
 * 메트릭 (C5): 없다. 조각은 metrics 패널을 두지 않으므로 ctx.metric 을 부르지 않는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 행 — 입력 하나와 그 해시. */
export type FixedLengthRow = {
  /** 입력 문자열. 빈 문자열도 유효한 입력이다. */
  input: string;
  /** 입력의 바이트 수. 화면이 그대로 인쇄한다. */
  bytes: number;
  /** 이 입력의 해시 (소문자 hex, 실측값). */
  hash: string;
};

export type HashFixedLengthFacetData = {
  type: 'hash-fixed-length';
  /** 화면에 인쇄할 해시 함수 이름. */
  algorithmLabel: string;
  /** 출력 비트 수. 화면이 "언제나 N비트" 로 인쇄한다. */
  hashBits: number;
  /**
   * 보여 줄 행들. 길이 차이가 한눈에 들어오도록 짧은 것부터 화면을 넘길 만큼
   * 긴 것까지 벌려 고른다.
   */
  rows: FixedLengthRow[];
  /**
   * 한 걸음 사이 머무는 간격 ms.
   *
   * 조각은 컨트롤바가 없어 speed-slider 로 늦출 수 없다. 읽을 시간을 주는 것은
   * 저작 결정이므로 선언에 둔다 (원칙 2).
   */
  stepMs: number;
};

export async function hashFixedLength(
  ctxBase: FacetContext<HashFixedLengthFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<HashFixedLengthFacetData>;
  const { algorithmLabel, hashBits, rows, stepMs } = ctx.data;

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
    payload: { algorithmLabel, hashBits, rows },
  });

  // 세 걸음. 길이가 다름을 먼저 보이고, 그 다음에 같음을 보인다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'reveal-inputs' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'reveal-outputs' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'mark-uniform' });
}

/**
 * 약수의 짝 — 왜 제곱근까지만 보면 충분한가.
 *
 * 1 부터 √n 까지 올라가며 짚는다. d 가 n 을 나누면 짝 q = n/d 가 그 자리에서
 * 함께 정해지므로, 작은 쪽을 만나는 순간 큰 쪽도 만난 것이다. 짝의 작은 쪽은
 * 언제나 √n 이하이니 √n 까지만 훑으면 모든 짝을 한 번씩 만난다.
 *
 * **1차 데이터는 n 하나다.** 약수도 짝도 √n 도 여기서 셈한다 — 화면에 뜨는 수를
 * 손으로 옮겨 적지 않는다.
 *
 * ── 이벤트 (target 은 쓰지 않는다. 자리는 payload 의 수가 정한다)
 *
 *   probe   { d: number; n: number }                   지금 짚는 수
 *   pair    { d: number; q: number; n: number; self: boolean }
 *                                                      d 가 약수다. 짝은 q = n/d.
 *                                                      self 는 d === q (√n 위의 칸)
 *   miss    { d: number; n: number }                   나누어떨어지지 않는다
 *   cover   { from: number; n: number }                from..n 을 덮는다 (√n 너머)
 *   rewind  {}                                         처음으로 되감는다
 *
 * 다섯 다 시각 변화가 있는 걸음 경계라 `silent` 를 붙이지 않는다 (C2).
 *
 * ── 메트릭
 *
 * 없다. 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 * 특히 **몇 번 덜 보는가는 이 조각의 물음이 아니다** — 그것은 완제품
 * `primality` 의 몫이고, 합성수에서는 드러나지도 않는다. 여기서는 짝의 대칭
 * 하나만 말하고 멈춘다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type DivisorPairsSqrtData = {
  type: string;
  /** 약수를 찾을 수. 짝도 √n 도 여기서 파생한다. */
  n: number;
  /** 걸음 사이 정지 시간(ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

export async function divisorPairsSqrtAlgorithm(
  ctx: FacetContext<DivisorPairsSqrtData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<DivisorPairsSqrtData>;
  const n = Math.max(2, Math.floor(rc.data.n));
  const stepMs = Math.max(0, Math.floor(rc.data.stepMs));
  const limit = Math.floor(Math.sqrt(n));

  /**
   * 걸음 수. 1..√n 을 하나씩 짚고(probe) 그때마다 답한 뒤(pair | miss),
   * 마지막에 √n 너머를 덮는다.
   *
   * 걸음표를 손으로 적지 않는다 — 이 수는 n 에서 나온다 (S-piece · C2).
   */
  const total = limit * 2 + 1;

  /** i 번째 걸음. 자동 재생과 한 걸음 짚기가 같은 함수를 쓴다. */
  async function runStep(i: number): Promise<void> {
    if (i >= limit * 2) {
      await rc.emit({ type: 'cover', payload: { from: limit + 1, n } });
      return;
    }
    const d = Math.floor(i / 2) + 1;
    if (i % 2 === 0) {
      await rc.emit({ type: 'probe', payload: { d, n } });
      return;
    }
    if (n % d !== 0) {
      await rc.emit({ type: 'miss', payload: { d, n } });
      return;
    }
    const q = n / d;
    await rc.emit({ type: 'pair', payload: { d, q, n, self: q === d } });
  }

  // 자동 재생. 문(sleep)은 걸음 *사이*에 둔다 — 첫 걸음 앞에는 기다릴 앞걸음이
  // 없으므로 마운트 직후의 그림이 곧바로 선다 (S-piece).
  for (let i = 0; i < total; i += 1) {
    if (rc.cancelled) return;
    await runStep(i);
    if (!(await rc.sleep(stepMs))) return;
  }

  // 여기서부터는 곱씹으며 한 걸음씩 짚어 보는 사람의 몫이다.
  let cursor = total;
  for (;;) {
    // waitForInput 이 취소 시 throw 하더라도 그 규약에 기대지 않는다 — 되짚기 루프가
    // 조각의 가장 바깥이라 여기서 새면 아무도 못 잡는다 (C8). advance 가 아닌 입력에
    // continue 로 돌아올 때도 이 줄을 다시 지난다.
    if (rc.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await rc.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
      if (!rc.cancelled) throw err;
      return;
    }
    if (input.type !== 'advance') continue;
    if (rc.cancelled) return;
    if (cursor >= total) {
      // 다 본 뒤의 첫 누름은 되감고 **첫 걸음까지** 간다. 되감기만 하면 눌러도
      // 반응이 없는 것으로 읽힌다 (S-piece).
      await rc.emit({ type: 'rewind', payload: {} });
      cursor = 0;
    }
    await runStep(cursor);
    cursor += 1;
  }
}

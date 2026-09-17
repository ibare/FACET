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
 * ── 이벤트 (target 도 payload 도 쓰지 않는다)
 *
 * 다섯 다 **빈 발신**이다. 걸음이 실을 만한 수가 하나도 없기 때문이다.
 *
 *   probe   {}   지금 짚는 수. 몇 번째 짚기인가가 곧 그 수다 (1 부터 하나씩).
 *   pair    {}   방금 짚은 수가 약수다. 짝은 q = n/d 로 바탕에서 나온다.
 *   miss    {}   방금 짚은 수로는 나누어떨어지지 않는다.
 *   cover   {}   √n 너머를 덮는다. 덮는 자리는 `sqrtLimit(n) + 1` 이다.
 *   rewind  {}   처음으로 되감는다.
 *
 * 다섯 다 시각 변화가 있는 걸음 경계라 `silent` 를 붙이지 않는다 (C2).
 *
 * ── 장면이 부르는 순수 함수 둘
 *
 * `readN` 과 `sqrtLimit` 은 바탕(n)에 먹이면 나오는 값이라 걸음에 싣지 않고
 * **함수로 내준다** — 장면이 같은 함수를 지나야 화면과 셈이 한 출처다
 * (`tasks/scene-migration-protocol.md` 4 절의 B 갈래). 잣대를 떼어 내도 "약수는
 * 짝을 이룬다" 는 주장은 그대로 남으므로 알고리즘 자체가 아니다.
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

/**
 * 그릴 수를 읽는다. 2 보다 작으면 짝을 이룰 것이 없으므로 2 로 올린다.
 *
 * 장면도 이 함수를 지난다. 좁히는 잣대가 두 군데면 언젠가 갈린다 — 옮기기 전
 * 화면은 2 보다 작은 수를 0 으로 읽어 알고리즘과 다른 답을 갖고 있었다.
 */
export function readN(raw: unknown): number {
  const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 2;
  return Math.max(2, v);
}

/**
 * 어디까지 훑나 — 자르는 잣대.
 *
 * 화면의 접는 자리도 이 함수에서 나온다. 옮기기 전에는 접는 자리를 "자기 자신과
 * 짝을 이룬 칸" 에서 얻어, 제곱수가 아닌 n 에서는 축이 아예 서지 않았다.
 */
export function sqrtLimit(n: number): number {
  return Math.floor(Math.sqrt(n));
}

export async function divisorPairsSqrtAlgorithm(
  ctx: FacetContext<DivisorPairsSqrtData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<DivisorPairsSqrtData>;
  const n = readN(rc.data.n);
  const stepMs = Math.max(0, Math.floor(rc.data.stepMs));
  const limit = sqrtLimit(n);

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
      await rc.emit({ type: 'cover' });
      return;
    }
    const d = Math.floor(i / 2) + 1;
    if (i % 2 === 0) {
      await rc.emit({ type: 'probe' });
      return;
    }
    // 나누어떨어지는가 — 이것만이 걸음이 내리는 판정이고, 그마저 발신의 **종류**로
    // 다 말해진다. 짝 q 는 n / d 라 바탕에서 나오므로 싣지 않는다.
    await rc.emit({ type: n % d === 0 ? 'pair' : 'miss' });
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
      await rc.emit({ type: 'rewind' });
      cursor = 0;
    }
    await runStep(cursor);
    cursor += 1;
  }
}

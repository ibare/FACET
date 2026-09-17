/**
 * 배깅(부트스트랩 표본) — 뽑고 되돌린다.
 *
 * 자료가 한 벌뿐인데 서로 다른 나무를 여럿 기르는 방법. 주머니에서 하나를 뽑아
 * 표본에 담고 **도로 넣는다**. 도로 넣기 때문에 같은 것이 두 번 세 번 뽑히고,
 * 그 바람에 한 번도 안 뽑히는 것이 생긴다. 그 남겨진 것이 그 나무를 시험할
 * 자료가 된다.
 *
 * 식별자
 *   index:<i>   주머니의 i 번째 자리 (0-based). `data.pool[i]` 가 그 자리의 번호.
 *
 * 이벤트 어휘 — `done` 만 표준이고 나머지는 이 facet 고유 확장이다. 전부 시각
 * 변화가 있는 걸음 경계라 silent 를 붙이지 않는다 (C2).
 *
 * **payload 를 싣는 발신이 하나도 없다.** 화면이 말하는 수는 전부 선언의 `pool` ·
 * `sets` 와 **발신이 온 차례**에서 나온다 — 어느 벌 몇 번째 뽑기인지, 무슨 값이
 * 나왔는지, 몇 번 나왔는지, 무엇이 남았는지가 모두 그렇다 (`scene.ts`). 뽑는
 * 차례를 선언이 이미 적어 두었으므로 걸음이 내리는 판정이 없다.
 *
 *   draw       한 번 뽑아 담고 도로 넣는다.
 *              payload 없음
 *
 *   left-out   한 벌을 다 뽑고 나서, 한 번도 안 뽑힌 것이 드러난다.
 *              payload 없음
 *              target 도 없다 — 어느 자리가 남았는지는 **이 조각의 결론**이라
 *              그림과 같은 자료에서 나와야 한다. 여기서 세어 실어 보내면 같은
 *              물음에 답이 둘이 된다.
 *
 *   done       (표준) 벌마다 남는 것이 다르다.
 *              payload 없음
 *              비율도 공식값도 싣지 않는다 — 앞의 것은 남은 자리의 수에서,
 *              뒤의 것은 아래 `neverDrawnProbability` 에서 나온다.
 *
 *   rewind     되짚기로 들어갈 때 화면을 처음으로 되돌린다.
 *              payload 없음
 *
 * 메트릭 없음 (조각이므로 `ctx.metric` 을 부르지 않는다 — S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BaggingSampleData = {
  type: 'bagging-sample';
  /** 주머니에 든 번호. 뽑아도 줄지 않는다 — 뽑은 것을 도로 넣기 때문이다. */
  pool: number[];
  /** 벌마다 뽑은 순서. 값은 모두 `pool` 의 원소다. */
  sets: number[][];
  /** 걸음 간격(ms). 읽을 시간을 주는 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

/**
 * 하나가 끝까지 한 번도 안 뽑힐 확률.
 *
 * 한 번 뽑을 때 특정 하나가 안 뽑힐 확률이 (1 − 1/n) 이고, 되돌려 넣으므로 매
 * 뽑기가 서로 독립이다. 따라서 k 번 내내 안 뽑힐 확률은 (1 − 1/n)^k 다.
 * n = k 로 키우면 1/e ≈ 0.3679 로 다가간다.
 *
 * 이것은 뽑은 순서에서 나오는 값이 아니라 공식이 주는 값이다. 화면이 실측값
 * 옆에 견주어 보이므로 셈을 여기 두고 근거를 남긴다.
 *
 * 장면이 그대로 부른다 (프로토콜 4 절의 B 갈래) — 주머니 크기와 뽑는 횟수만으로
 * 정해지는 순수 함수라 실어 보낼 까닭이 없고, 떼어 내도 "되돌리기 때문에 남는
 * 것이 생긴다" 는 이 조각의 주장이 그대로 남는다.
 */
export function neverDrawnProbability(n: number, k: number): number {
  if (n <= 0 || k <= 0) return 0;
  return Math.pow(1 - 1 / n, k);
}

export async function baggingSampleAlgorithm(
  ctxIn: FacetContext<BaggingSampleData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<BaggingSampleData>;
  const { pool, sets, stepMs } = ctx.data;

  // 주머니에 없는 번호를 뽑았다면 선언이 어긋난 것이다. 화면이 거짓을 말하기
  // 전에 여기서 멈춘다 (C6). 이 두 겹은 발신도 대기도 없는 동기 검사라 취소를
  // 볼 자리가 아니다 — 첫 걸음이 나가기 전에 끝난다.
  for (let s = 0; s < sets.length; s += 1) {
    for (const value of sets[s]) {
      if (!pool.includes(value)) {
        throw new Error(
          `배깅 표본이 주머니에 없는 값을 뽑았다: 벌 ${s + 1}, 값 ${value}`,
        );
      }
    }
  }

  /** 되짚기 상태 — 자동 재생을 마친 뒤에는 걸음마다 사용자를 기다린다. */
  let manual = false;
  /** 되감기 직후의 첫 문. 눌렀는데 아무 일도 없는 것으로 읽히지 않게 통과시킨다. */
  let freeGate = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    for (;;) {
      if (ctx.cancelled) return false;
      const input = await ctx.waitForInput();
      if (input.type !== 'advance') continue;
      return !ctx.cancelled;
    }
  }

  /** 세 벌을 처음부터 끝까지 뽑는다. 끝까지 갔으면 true. */
  async function play(): Promise<boolean> {
    for (const draws of sets) {
      if (ctx.cancelled) return false;

      // 무슨 값을 뽑았는지는 싣지 않는다 — 선언의 `sets` 에 이미 있고 장면이
      // 그것을 읽는다. 걸음은 몇 번째 뽑음인가만 옮긴다.
      for (let k = 0; k < draws.length; k += 1) {
        if (!(await gate())) return false;
        await ctx.emit({ type: 'draw' });
      }

      // 남은 것을 여기서 세지 않는다 — 한 번도 안 나온 자리가 어디인가는 이
      // 조각의 결론이고, 장면이 같은 `sets` 에서 셈한다 (scene.ts 의 leftOutIn).
      if (!(await gate())) return false;
      await ctx.emit({ type: 'left-out' });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done' });
    return true;
  }

  if (!(await play())) return;

  // 자동 재생을 마쳤다. 이제부터는 한 걸음씩 짚어 볼 수 있다.
  for (;;) {
    if (ctx.cancelled) return;
    const input = await ctx.waitForInput();
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;
    manual = true;
    freeGate = true;
    await ctx.emit({ type: 'rewind' });
    if (!(await play())) return;
  }
}

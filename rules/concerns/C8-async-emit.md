---
name: C8 비동기 이벤트 규율
description: ctx.emit 은 반드시 await 한다. 루프 내부에서는 ctx.cancelled 를 주기적으로 검사해 조기 종료한다.
type: concern
version: 2
last_verified: 2026-09-09
---

# C8. 비동기 이벤트 규율

## When to Apply

- `algorithm.ts` 작성 / 수정
- FacetContext 를 소비하는 모든 알고리즘 코드 (현재는 facet 알고리즘 + `packages/core/src/examples/algorithms/**`)

## MUST

- `ctx.emit(...)` 호출은 **항상 `await`** 한다. `emit` 은 `Promise<void>` 를 반환하며, 러너가 paused/stepping 모드에서 여기서 대기한다.
- 모든 `for` / `while` 루프의 진입 직후 (바디 시작부) 에 `if (ctx.cancelled) return;` 을 배치한다. 레벨이 깊은 루프는 바깥 루프에도 반드시 포함한다.
  - **바디 첫 줄이 취소를 지는 문(gate)이면 그것이 진입 검사다** — 아래 reactive 절.
- 알고리즘 함수의 반환 타입은 `Promise<void>`. 동기 함수로 선언하지 않는다.
- `silent: true` 를 사용할지는 "사용자 step boundary 인가?" 로 판단한다. 시각 변화가 있는 이벤트 (`highlight`, `state-changed`, `mark`, `unhighlight`) 는 절대 silent 아님. 메타 이벤트 (`phase`) 만 silent.

## reactive 조각의 문(gate)

조각(S-piece)은 `mechanismKind: 'reactive'` 라 걸음 간격을 스스로 정한다. 걸음
사이마다 **문**을 하나 두는 짜임이 정본이고, 그 문이 취소를 대신 진다.

```ts
/** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
async function gate(): Promise<boolean> {
  if (ctx.cancelled) return false;
  if (!manual) return ctx.sleep(stepMs);          // sleep 이 곧 검사다
  if (freeGate) {                                  // 되감기 직후의 첫 문
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
```

- **돌려주는 타입은 `Promise<boolean>` 이다.** `ctx.sleep` 이 `Promise<boolean>` 을
  돌려주는데 문이 `Promise<void>` 면 그 값을 버리게 되고, 그러면 **취소가 실제로
  먹지 않는다.** 타입도 통과하고 예외도 안 나며 emit 이 no-op 이라 화면도 멀쩡해
  눈으로는 못 잡는다. 조각 일곱 중 하나가 이 구멍을 냈다.
- **부르는 쪽은 반드시 받는다** — `if (!(await gate())) return;`. 이 한 줄이 루프
  바디의 첫 줄이면 위 MUST 의 진입 검사를 충족하므로 `ctx.cancelled` 를 그 위에
  겹쳐 적지 않는다.
- **문이 없는 루프는 자기가 검사를 진다.** 한 걸음 안에서 여러 번 발신하는 루프
  (이웃 여럿이 한꺼번에 담기는 것이 곧 그 걸음의 뜻인 경우)에는 문을 둘 수 없다.
  그때는 바디 첫 줄에 `if (ctx.cancelled) return;` 을 직접 적고, **왜 문이 없는지**
  를 그 자리에 한 줄 남긴다.
- **갈림과 취소를 boolean 하나로 겹치지 않는다.** "찾았다/못 찾았다" 를 돌려주는
  함수가 취소도 `false` 로 말하면 부르는 쪽이 둘을 구별하지 못해 취소된 뒤에도
  다음 단계로 넘어간다. 뜻이 셋이면 유니온으로 셋을 돌려준다
  (`'pure' | 'exhausted' | 'cancelled'`).
- **`waitForInput` 루프는 앞뒤로 본다.** 그것이 취소 시 throw 하더라도 규약에
  기대지 않는다 — 되짚기 루프가 조각의 가장 바깥이라 여기서 새면 아무도 못 잡는다.

이 절이 없던 동안 조각 일곱 중 **넷이 같은 자리에서 어긋났다.** 위 MUST 의 "모든
루프 진입부" 가 reactive 의 실제 취소 규약(문이 취소를 진다)과 겹쳐 읽히지 않은
탓이다. 정본을 여기 둔다.

## MUST NOT

- `ctx.emit(...)` 를 `await` 없이 호출해 fire-and-forget 하지 않는다. 러너는 이 `await` 에서 동기화 타이밍을 얻는다.
- `Promise.all([ctx.emit(a), ctx.emit(b)])` 같은 병렬 발신 금지. 이벤트는 **순차** 발신이 계약이다.
- 알고리즘 내부에서 `setTimeout` / `setInterval` / `requestAnimationFrame` / `Promise<delay>` 같은 타이밍 트릭을 직접 만들지 않는다. 시간 축 제어는 러너 + `control-bar.speed` 의 몫.
- 알고리즘 내부에서 DOM / window / document 를 참조하지 않는다 (환경 오염).

## PREFER

- 긴 단위 루프 안에 `ctx.cancelled` 검사를 자주 넣는다 — 취소 반응성을 위해. 스텝 하나에 수천 반복이 들어가는 알고리즘이라면 중간에도 검사.
- 복잡한 phase 는 `silent: true` 로 전파 후 표준 이벤트 (`highlight` 등) 로 실제 시각 변화를 발신하는 2단계 구성을 쓴다 (bubblesort 패턴).

## Exception

- 순수 계산 헬퍼 (예: `computeBubblesortResult`) 는 알고리즘이 아니므로 이 규칙의 대상이 아니다. `ctx` 를 받지 않고 동기로 둔다.

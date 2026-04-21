---
name: C8 비동기 이벤트 규율
description: ctx.emit 은 반드시 await 한다. 루프 내부에서는 ctx.cancelled 를 주기적으로 검사해 조기 종료한다.
type: concern
version: 1
last_verified: 2026-04-21
---

# C8. 비동기 이벤트 규율

## When to Apply

- `algorithm.ts` 작성 / 수정
- FacetContext 를 소비하는 모든 알고리즘 코드 (현재는 facet 알고리즘 + `packages/core/src/examples/algorithms/**`)

## MUST

- `ctx.emit(...)` 호출은 **항상 `await`** 한다. `emit` 은 `Promise<void>` 를 반환하며, 러너가 paused/stepping 모드에서 여기서 대기한다.
- 모든 `for` / `while` 루프의 진입 직후 (바디 시작부) 에 `if (ctx.cancelled) return;` 을 배치한다. 레벨이 깊은 루프는 바깥 루프에도 반드시 포함한다.
- 알고리즘 함수의 반환 타입은 `Promise<void>`. 동기 함수로 선언하지 않는다.
- `silent: true` 를 사용할지는 "사용자 step boundary 인가?" 로 판단한다. 시각 변화가 있는 이벤트 (`highlight`, `state-changed`, `mark`, `unhighlight`) 는 절대 silent 아님. 메타 이벤트 (`phase`) 만 silent.

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

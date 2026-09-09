---
name: C1 Target 식별자 문법
description: 이벤트 target 식별자 문법은 parseTarget 경유로만 파싱한다. 정규식 인라인 중복 금지.
type: concern
version: 2
last_verified: 2026-09-09
---

# C1. Target 식별자 문법

## When to Apply

- Projector 가 `event.target` 을 해석할 때
- 러너 / View 가 식별자 prefix 를 해석할 때
- 새 자료구조를 도입해 새 prefix 가 필요할 때

## MUST

- Projector 는 `event.target` 에서 index 를 꺼낼 때 `parseTarget(t)` 를 사용한다 (`@ffacet/core/runtime` 에서 export). 결과의 `prefix` 와 `id` 를 타입 분기한다.
- 표준 prefix (`index:` · `node:` · `edge:` · `queue:` · `list:` · `tree:`) 를 **우선** 쓴다. 뜻이 맞는 것이 없으면 새로 짓되, 그 목록과 뜻을 해당 `algorithm.ts` 상단 주석에 적는다 (이벤트 어휘와 같은 짜임 — C2).
- `target` 이 `string` 또는 `string[]` 어느 쪽이든 처리 가능해야 한다. `FacetEventTarget` 공용 타입을 사용한다.
- 다중 target 파싱 공용 헬퍼가 필요하면 `@ffacet/core/runtime` 에 추가하고 그 한 곳에서만 쓴다.

## MUST NOT

- Projector 안에 `/^index:(\d+)$/` 같은 정규식을 **인라인으로 작성하지 않는다**. 식별자 파싱은 Projector 의 책임이 아니다.
- 식별자 prefix 를 문자열 리터럴로 직접 조립하지 않는다 (`` `index:${i}` `` 는 허용하지만, `'index:' + i` 같은 느슨한 조합은 피한다 — 타입 체크가 약해진다).
- 새 prefix 를 **Projector 단독으로** 만들어 쓰지 않는다. 짓는 자리는 algorithm 이고, 거기 주석에 적힌 것만 projector 가 안다.
  - 한때 이 자리가 "반드시 `TargetPrefix` 에 선언한 뒤 사용한다" 였다. 그런데 `TargetPrefix` 는 `'index' | … | string` 이라 **유니온에 무엇을 적어도 타입상 아무 효력이 없고**, 저장소에는 이미 미선언 prefix 22 종이 산다. 강제할 수 없는 조항이 남아 있으면 어긴 것을 어겼다고 말할 근거가 사라진다. 유니온은 표준 여섯을 **알려 주는** 것이지 닫힌 집합이 아니다.

## PREFER

- 자주 쓰이는 파싱 (`string | string[]` → `number[]`) 은 `toIndexArray(target)` 류의 공용 헬퍼로 승격한다.
- 식별자 조립 쪽도 `formatTarget('index', n)` 헬퍼가 있으면 이상적.

## Exception

- `packages/core/src/types/event.ts` 의 `parseTarget` **정의** 자체는 정규식/슬라이싱을 포함할 수밖에 없다. 이 한 곳만 예외.
- `packages/host-tiptap/src/markdown.ts` 의 DSL 파서 `{facet:<id>}` 는 target 식별자가 아니라 호스트 문법이므로 이 규칙의 대상이 아니다.

---
name: C5 메트릭 네이밍
description: 메트릭 이름은 kebab-case 이며, algorithm 이 ctx.metric 으로 갱신하는 이름과 facet.ts 의 metrics[].name 은 반드시 일치한다.
type: concern
version: 1
last_verified: 2026-04-21
---

# C5. 메트릭 네이밍

## When to Apply

- `algorithm.ts` 에서 `ctx.metric(name, 'inc' | <delta>)` 호출
- `facet.ts::blocks.<controls>.metrics[]` 선언
- 새 메트릭 추가

## MUST

- 메트릭 이름은 **kebab-case** (소문자 + `-`). 동사/명사는 명사 중심: `compare-count`, `swap-count`, `pass-count`, `access-count`, `shift-count`, `recurse-depth` 등.
- `ctx.metric('<name>', ...)` 의 `<name>` 은 같은 facet 의 `facet.ts::metrics[].name` 에 **반드시 선언** 되어야 한다. (미선언 메트릭은 UI 에 나타나지 않으므로 조용히 사라진다.)
- metrics 선언에서 `label` 은 `LocaleStr` (`{ en, ko, ... }`) 로 쓴다. 단순 문자열은 영어만 표시되므로 사용자 노출 텍스트는 다국어화한다.
- `initial` 은 원점 (보통 `0`). 메트릭 리셋은 러너가 `resetMetrics()` 로 수행하므로 별도 초기화 이벤트 불필요.

## MUST NOT

- 같은 의미의 메트릭을 두 개 이름으로 두지 않는다 (`compare-count` 와 `comparison-count` 혼용 금지).
- camelCase / snake_case / PascalCase 금지. 오직 kebab-case.
- 메트릭 이름에 공백, 한국어, 특수문자 포함 금지.

## PREFER

- 수치 의미가 명확하게 전달되도록 suffix 를 통일: 횟수는 `-count`, 깊이는 `-depth`, 크기는 `-size`.
- 새 메트릭을 추가할 때 기존 facet 의 이름 사례를 우선 참고해 네이밍 충돌을 피한다.

## Exception

- 없음. 이 규칙은 전체 facet 에 일괄 적용된다.

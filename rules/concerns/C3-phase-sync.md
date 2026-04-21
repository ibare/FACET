---
name: C3 Phase 어휘 동기화
description: algorithm.ts 의 phase payload 값 ↔ irs.ts 의 phase 필드 값은 반드시 일치한다. 불일치 시 코드 패널 하이라이트가 조용히 깨진다.
type: concern
version: 1
last_verified: 2026-04-21
---

# C3. Phase 어휘 동기화

## When to Apply

- 알고리즘이 `ctx.emit({ type: 'phase', payload: { phase: '<이름>' }, silent: true })` 를 발신할 때
- `irs.ts` 의 IRStmt 에 `phase: '<이름>'` 필드를 부여할 때
- facet 에 새 학습용 phase 를 추가할 때

## MUST

- 한 facet 내부에서 `algorithm.ts` 의 `phase` 값과 `irs.ts` 의 모든 IR 의 `phase` 값 **집합이 완전히 일치** 해야 한다 (대응되지 않는 phase 는 없어야 한다).
- `algorithm.ts` 파일 상단 주석에 사용 중인 phase 목록을 명시한다 (`phase (kind: 'compare' | 'swap' | 'pass-end')` 식).
- phase 이름은 kebab-case. 단어 경계는 `-` 로.
- `phase` 이벤트는 항상 `silent: true` 로 발신한다 (C2 와 정합).
- 새 phase 를 추가하거나 기존 phase 를 rename 할 때는 같은 commit 에서 algorithm / irs 를 **함께** 수정한다.

## MUST NOT

- algorithm 에 등장하는 phase 가 irs 에 없는 상태로 병합하지 않는다. (하이라이트 조용히 실패)
- irs 에만 존재하고 algorithm 이 발신하지 않는 phase 는 dead code 다. 제거한다.
- phase 값을 변수 / enum 우회로 이름을 가리지 않는다. 반드시 리터럴 문자열.

## PREFER

- 표준화된 phase 이름 어휘 후보: `compare`, `swap`, `assign`, `loop-begin`, `loop-end`, `pass-begin`, `pass-end`, `recurse`, `return`, `done`.
- 테스트로 phase 정합성을 검증하고 싶다면 `packages/ir-interpreter/test/phase-meta.test.ts` 패턴을 참고해 facet 단위 phase-set 등치 테스트를 추가한다.

## Exception

- algorithm 이 `phase` 이벤트 자체를 발신하지 않는 facet 은 irs 의 phase 필드도 전면 생략한다 (부분 생략 금지 — all-or-none).

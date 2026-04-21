---
name: C6 에러 처리 / 로깅
description: facet / view / projector 코드는 throw 로 오류를 표현하고 console.* 는 쓰지 않는다. 러너 진입부만 최후 방어로 console.error 를 허용한다.
type: concern
version: 1
last_verified: 2026-04-21
---

# C6. 에러 처리 / 로깅

## When to Apply

- facet / projector / view / transpiler / ir-interpreter / host 어댑터 코드 작성
- 러너 `runFacet` 내부 예외 방어 작성

## MUST

- 도메인 오류는 **`throw new Error('<한국어 메시지>')`** 로 표현한다. 알고리즘/Projector/View 내부에서 `console.*` 로 덮고 넘어가지 않는다.
- 러너 (`packages/core/src/runtime/runner.ts`) 는 알고리즘/projector 실행의 예외를 `try/catch` 로 받고, 세션이 cancelled 상태가 아니면 `console.error('[facet] ...', err)` 로 로깅한다. 이것이 유일하게 허용된 `console.*` 호출 지점이다.
- Error 메시지는 한국어로 작성한다 (이 프로젝트 전체 규약). 프로젝트 내 기존 메시지 (`알고리즘 모듈 미등록: <name>`) 와 톤을 맞춘다.
- catch 블록에서 에러를 삼키려면 `// ignore` 주석으로 명시한다 (runner.ts 내부의 destroy 경로가 모범).

## MUST NOT

- facet / view / projector / transpiler 코드에 `console.log` / `console.warn` / `console.error` / `console.debug` 를 쓰지 않는다.
- try/catch 로 오류를 잡고 조용히 무시하지 않는다. 주석 없이 빈 `catch {}` 금지.
- 원인을 숨기는 `throw new Error('something failed')` 같은 무내용 메시지 금지. 어떤 자원 / 어떤 id / 어떤 상태에서 실패했는지 명시한다.

## PREFER

- 등록 관련 오류는 "<무엇>: <어느 id>" 형태 (`알고리즘 모듈 미등록: bubblesort`).
- 테스트에서는 `expect(...).toThrow(...)` 로 error 메시지 일부를 검증한다.

## Exception

- `packages/core/src/examples/**` 의 샘플 코드는 학습용이므로 `console.log` 허용. 단 배포 경로에는 포함되지 않아야 한다.
- 테스트 파일 (`**/*.test.ts`) 내부는 이 규칙의 대상이 아니다.

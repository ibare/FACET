---
name: S-transpiler
description: IR → 언어별 소스 코드 트랜스파일러의 입출력 계약, supports 배열 정합, phase 어휘 존중.
type: specific
version: 1
last_verified: 2026-04-21
---

# S-transpiler. Transpiler 규율

## 적용 범위

- `packages/transpiler-{cpp,csharp,java,javascript,python,typescript}/**/*.ts`
- `packages/ir-interpreter/**/*.ts` (IR 실행기)

## MUST

- 각 transpiler 패키지는 `src/index.ts` 에서 다음을 export 한다:
  - `xxxTranspiler: Transpiler` 객체
  - `registerXxxTranspiler(): void` 등록 헬퍼
- `Transpiler.id` 는 언어 이름 단일 소문자 (`'python'`, `'java'`, ...). `code-view.transpiler: 'transpiler:<id>'` 의 `<id>` 와 일치해야 한다.
- `Transpiler.supports: Paradigm[]` 는 해당 언어가 실제로 처리 가능한 IR paradigm 을 명시한다 (`'imperative'` 등). 러너는 이 배열로 호환 목록을 필터링한다.
- `Transpiler.transpile(ir: IR): TranspiledCode` 는 **입력 IR 을 변형하지 않는다** (pure). 재호출 시 동일 결과.
- IR 의 `phase` 필드를 코드 라인 메타데이터로 전달한다. 소스 코드 출력의 각 줄에 대응하는 phase 를 기록해 코드 패널 하이라이트가 동작하도록 한다.
- IR → 소스의 식별자/예약어 충돌은 각 언어별로 해결한다 (예: Python 의 `pass`, Java 의 `return` 등). 알고리즘 코드의 변수명을 그대로 쓰기 어렵다면 transpiler 가 rename.

## MUST NOT

- transpiler 가 IR 에 없는 semantics 를 임의로 추가하지 않는다. IR 이 부족하면 IR 을 확장하는 것이 먼저.
- transpiler 가 다른 transpiler 를 import 하지 않는다. 서로 독립.
- `supports` 에 등록된 paradigm 외의 IR 을 받으면 **throw** 한다 (한국어 메시지). 조용히 빈 결과를 반환하지 않는다.
- 소스 코드 문자열에 `\n` 외의 EOL 를 섞지 않는다. 일관된 `\n`.

## PREFER

- 언어별 들여쓰기 convention 은 각 transpiler 가 소유한다 (Python 4-space, Java 4-space, JS 2-space 등 일반 관례).
- `ir-interpreter` 와 transpiler 는 같은 IR 스키마를 소비하므로, IR 타입 변경은 둘 모두를 반드시 함께 수정한다 (같은 commit).
- 테스트는 `test/<name>.test.ts` 또는 `ir-interpreter/test/roundtrip.test.ts` 에서 IR → 소스 → 실행 결과의 일관성을 검증.

## Exception

- 일부 언어 특유의 제약 (TypeScript 의 readonly, Java 의 generic erasure 등) 으로 IR 을 완전히 표현할 수 없는 경우, transpiler 는 **주석으로 주의사항** 을 코드 상단에 남긴다. 조용히 생략 금지.

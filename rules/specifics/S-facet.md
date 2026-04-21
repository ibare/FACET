---
name: S-facet
description: facets/cs-fundamentals/* 내부의 6파일 구성과 각 파일의 책임. 18개 facet 에서 예외 없이 유지되어 온 프로젝트의 가장 강한 구조 패턴.
type: specific
version: 1
last_verified: 2026-04-21
---

# S-facet. Facet 패키지 구조

## 적용 범위

`facets/**/<name>/src/**/*.ts` — 현재는 `facets/cs-fundamentals/*` 18종.

## 표준 6파일 구성

각 facet 의 `src/` 는 다음 6파일만을 가진다:

| 파일 | 역할 | export |
|------|------|--------|
| `algorithm.ts` | `async (ctx: FacetContext<T>) => Promise<void>` 와 `computeResult?` 순수 함수 | `xxxAlgorithm` / `computeXxxResult` / `XxxData` (타입) |
| `projector.ts` | `ProjectorFactory` — 이벤트 → View 메서드 번역 | `xxxProjector` |
| `irs.ts` | `IR[]` — 코드 패널 IR 정의 | `xxxImperativeIR` (주 IR) + `xxxIRs` 배열 |
| `facet.ts` | `FacetJson` — layout/blocks 선언 | `xxxFacet` |
| `description.ts` | 학습 설명 마크다운 문자열 | `xxxDescription` |
| `index.ts` | 위 전부 re-export + `register<Name>()` 헬퍼 | `register<Name>` + 개별 심볼 |

## MUST

- 새 facet 은 반드시 위 6파일 구성을 따른다. 파일 이름도 그대로.
- `index.ts::register<Name>()` 는 다음을 **이 순서대로** 호출한다:
  1. `registerAlgorithm(name, fn, { computeResult? })`
  2. `registerProjector(<name>Projector, ...)`
  3. `for (const ir of xxxIRs) registerIR(ir.id, ir)`
  4. `registerFacets([xxxFacet])`
  5. `registerDescription(xxxFacet.id, xxxDescription)`
- `algorithm.ts` 의 `TData` 제네릭 타입 (예: `BubbleSortData`) 은 `{ type: string; ... }` 형태이며 `index.ts` 와 facet 외부로 export 한다 (테스트가 사용).
- `facet.ts` 는 로직을 담지 않는다 — `FacetJson` 객체 리터럴만.
- `description.ts` 에 등장하는 `{facet:<id>}` 토큰은 같은 패키지 `facet.ts::id` 와 일치해야 한다 (C4 참조).

## MUST NOT

- 6파일 외 추가 `.ts` 파일을 `src/` 루트에 두지 않는다. 내부 헬퍼가 필요하면 `algorithm.ts` / `projector.ts` 내부에 두거나, 두 파일이 공유하는 경우 팀 논의를 거친 뒤 별도 파일을 만든다 (이 경우 index.ts 에서 re-export 금지 — 내부용).
- facet 패키지가 **다른 facet 패키지를 import 하지 않는다**. 공유 로직은 `@facet/core` 로 올린다.
- `facet.ts` 에서 알고리즘/Projector 를 함수 참조로 직접 넣지 않는다 — 반드시 `algorithm: 'module:<name>'`, `projector: 'module:<name>'` 문자열 참조.
- `index.ts` 가 사이드 이펙트로 `register<Name>()` 을 자동 호출하지 않는다. 호출 책임은 호스트 앱 (playground 등) 에 있다.

## PREFER

- `algorithm.ts` 상단 JSDoc: 식별자 / 이벤트 목록 + payload 스키마 / phase 어휘 / 메트릭 목록을 기재 (bubblesort 모범).
- `computeResult` 는 goal-preview 가 있는 facet 에서만 구현. 없으면 생략.
- 테스트는 `test/<name>.test.ts` 에 두며, `algorithm.ts` 의 `compute<Name>Result` 와 알고리즘 실행 결과 ({values} 비교) 를 검증한다.

## Exception

- `packages/core/src/examples/algorithms/**` + `examples/facets/**` + `examples/projectors/**` 는 러너 검증용 최소 샘플이며 이 구조 규칙의 대상이 아니다.

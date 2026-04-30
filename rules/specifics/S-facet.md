---
name: S-facet
description: facets/**/*/ 내부의 6파일 (+ 선택적 stage view 1파일) 구성과 각 파일의 책임. 프로젝트 facet 전체에서 유지되어 온 가장 강한 구조 패턴.
type: specific
version: 3
last_verified: 2026-04-30
---

# S-facet. Facet 패키지 구조

## 적용 범위

`facets/**/<name>/src/**/*.ts` — `facets/cs-fundamentals/*` + `facets/system-design/*` + `facets/database/*` + `facets/control-flow/*` + `facets/security/*` + `facets/compilers/*` + `facets/ml-basics/*` 등 모든 facet 패키지.

## 표준 구성 — 6파일 + 선택적 stage view 1파일

각 facet 의 `src/` 는 다음 6파일을 반드시 가지며, 빌트인 view 어휘로 표현 불가능한 facet 전용 시각화가 필요하면 `*-stage.ts` 한 파일을 더 둘 수 있다:

| 파일 | 역할 | export |
|------|------|--------|
| `algorithm.ts` | `async (ctx: FacetContext<T>) => Promise<void>` 와 `computeResult?` 순수 함수 | `xxxAlgorithm` / `computeXxxResult` / `XxxData` (타입) |
| `projector.ts` | `ProjectorFactory` — 이벤트 → View 메서드 번역 | `xxxProjector` |
| `irs.ts` | `IR[]` — 코드 패널 IR 정의 (없으면 빈 배열) | `xxxImperativeIR` (주 IR) + `xxxIRs` 배열 |
| `facet.ts` | `FacetJson` — layout/blocks 선언 | `xxxFacet` |
| `description.ts` | 학습 설명 마크다운 문자열 | `xxxDescription` |
| `index.ts` | 위 전부 re-export + `register<Name>()` 헬퍼 | `register<Name>` + 개별 심볼 |
| `<short>-stage.ts` (선택) | 단일 SVG 캔버스에 facet 전용 시각화를 그리는 view 1개. `ViewSpec` 으로 export 하고 `register<Name>()` 가 `registerView('<view-id>', ...)` 로 등록 | `xxxStageView` (인덱스에서 re-export 가능) |

## stage view 파일이란

`*-stage.ts` 는 빌트인 view (`packages/core/src/views/*` — bars / array-cells / linked-list / graph-canvas / text-display 등) 로 표현이 불가능한 facet 고유 시각화를 단일 SVG 캔버스 한 폭에 직접 그리는 view 모듈이다. projector 가 호출할 메서드 인터페이스 (`init`, `signalStepBegin` / `signalStepEnd` / `signalConverged` 등) 를 노출하고, 디자인 토큰만으로 색을 결정하며 (S-view 결정 트리 준수), 좌표계·레이아웃·캡션 영역·참조 칩 배치를 담당한다. projector 안에 SVG 렌더 코드를 1000+ LOC 두는 것은 책임 분리 위반이라 별도 파일로 분기한다.

현재 stage view 를 둔 facet: `caching-cdn` / `relational-tables-and-keys` / `conditional-statement` / `asymmetric-rsa` / `tokenization` / `linear-regression`.

## MUST

- 새 facet 은 반드시 위 6파일 구성을 따른다. 파일 이름도 그대로. stage view 가 필요하면 `<short>-stage.ts` 1파일을 추가한다 (예: `cdn-stage.ts`, `rsa-stage.ts`, `linear-regression-stage.ts`).
- `index.ts::register<Name>()` 는 다음을 **이 순서대로** 호출한다:
  1. `registerAlgorithm(name, fn, { computeResult?, mechanismKind? })`
  2. `registerProjector(<name>Projector, ...)`
  3. `for (const ir of xxxIRs) registerIR(ir.id, ir)`
  4. (stage view 가 있으면) `registerView('<view-id>', xxxStageView)` — Facets 등록 직전
  5. `registerFacets([xxxFacet])`
  6. `registerDescription(xxxFacet.id, xxxDescription)`
- `algorithm.ts` 의 `TData` 제네릭 타입 (예: `BubbleSortData`) 은 `{ type: string; ... }` 형태이며 `index.ts` 와 facet 외부로 export 한다 (테스트가 사용).
- `facet.ts` 는 로직을 담지 않는다 — `FacetJson` 객체 리터럴만.
- `description.ts` 에 등장하는 `{facet:<id>}` 토큰은 같은 패키지 `facet.ts::id` 와 일치해야 한다 (C4 참조).
- `facet.ts` 의 control-bar 블록 `controls[]` 항목은 `{ widget, action, label? }` 객체 형식만 사용한다. `widget` 은 control-bar 가 해석할 위젯 어휘 (`'button'` / `'speed-slider'` / `'value-input'` / `'segmented-slider'`), `action` 은 mechanism `supportedControls` 와 매칭되는 어휘 (`'play' | 'step' | 'pause' | 'reset' | 'speed'`) 또는 facet 전용 onAction 어휘. 문자열 리터럴 / 구식 `{ type: 'speed-slider' }` 형태 금지.
- **facet 영역 내 색 hex/rgba 리터럴 0건** (algorithm / projector / facet / description / irs / index 모두). Projector 는 view 메서드 호출만 하고 색은 view 가 토큰에서 받는다. 색 결정 트리는 S-view "색 토큰 결정 트리" 절을 따른다.

## MUST NOT

- 표준 6파일 + 선택적 `*-stage.ts` 외 추가 `.ts` 파일을 `src/` 루트에 두지 않는다. 내부 헬퍼가 필요하면 `algorithm.ts` / `projector.ts` / `*-stage.ts` 내부에 두거나, 두 파일이 공유하는 경우 팀 논의를 거친 뒤 별도 파일을 만든다 (이 경우 index.ts 에서 re-export 금지 — 내부용).
- stage view 가 빌트인 view 어휘 (bars / array-cells / linked-list / graph-canvas / text-display 등) 로 표현 가능한데도 `*-stage.ts` 를 만들지 않는다. stage 파일은 빌트인 어휘로 표현 불가능한 facet 고유 시각화에 한정한다.
- facet 패키지가 **다른 facet 패키지를 import 하지 않는다**. 공유 로직은 `@facet/core` 로 올린다.
- `facet.ts` 에서 알고리즘/Projector 를 함수 참조로 직접 넣지 않는다 — 반드시 `algorithm: 'module:<name>'`, `projector: 'module:<name>'` 문자열 참조.
- `index.ts` 가 사이드 이펙트로 `register<Name>()` 을 자동 호출하지 않는다. 호출 책임은 호스트 앱 (playground 등) 에 있다.

## PREFER

- `algorithm.ts` 상단 JSDoc: 식별자 / 이벤트 목록 + payload 스키마 / phase 어휘 / 메트릭 목록을 기재 (bubblesort 모범).
- `computeResult` 는 goal-preview 가 있는 facet 에서만 구현. 없으면 생략.
- 테스트는 `test/<name>.test.ts` 에 두며, `algorithm.ts` 의 `compute<Name>Result` 와 알고리즘 실행 결과 ({values} 비교) 를 검증한다.

## Exception

- `packages/core/src/examples/algorithms/**` + `examples/facets/**` + `examples/projectors/**` 는 러너 검증용 최소 샘플이며 이 구조 규칙의 대상이 아니다.

---
name: C9 타입 경계
description: as unknown as / as Record / as any 캐스팅은 구조적 열린 타입 경계에서만 허용한다. 러너 내부 데이터 전달에는 정식 타입으로 좁힌다.
type: concern
version: 1
last_verified: 2026-04-21
---

# C9. 타입 경계

## When to Apply

- Projector 가 `views.stage` 같은 동적 View 인스턴스를 구체 타입으로 사용할 때
- 러너 / layout-builder 가 `FacetJson.blocks` 의 오픈 스키마 `BlockSpec` 을 구체 블록 스펙으로 좁힐 때
- `event.payload: unknown` 를 구체 shape 으로 읽을 때

## MUST

- `ViewInstance` / `BlockSpec` / `FacetRuntimeEvent.payload` 처럼 **설계상 오픈 타입** 을 소비할 때만 `as unknown as <구체형>` 을 허용한다.
- 구체형 선언은 **파일 상단 `type Xxx = { ... }` 로 끌어올린다**. 즉, cast 지점은 간결하고 구체형은 한 곳에 모인다 (bubblesort/projector.ts 의 `type BarChart = {...}` 가 모범).
- 구체형의 optional 메서드는 Projector 가 반드시 `?.()` 로 호출한다 (해당 메서드가 없는 View 와의 호환성 유지).
- `event.payload` 를 읽을 때는 좁은 인라인 타입 단언 (`const p = event.payload as { passNumber?: number } | undefined;`) 으로 한 번에 좁히고, 각 필드는 `typeof p?.x === 'number'` 같은 런타임 가드를 추가한다.

## MUST NOT

- **`any` 사용 금지**. 이 프로젝트는 현재 `any` 0건을 유지하고 있다 (감사 확인됨). tsc 의 `noImplicitAny` 가 켜져 있으므로 암묵 any 도 없어야 한다.
- 같은 구체형 cast 가 한 파일에 10회 이상 반복되면 중앙 타입 선언이나 헬퍼로 추출한다.
- 런타임 값 검증 없이 `as` 캐스팅으로 payload 구조를 "믿고" 소비하지 않는다 — 반드시 `typeof`/`Array.isArray` 등의 가드 후 사용.
- 테스트 외 코드에서 `as Record<string, unknown>` 을 타입 힌트 회피 목적으로 쓰지 않는다. 정식 타입이 있으면 그것을 쓴다.

## PREFER

- 공통 View 구조적 타입 (BarChart, PassTracker, SnapshotStrip 등) 이 여러 Projector 에서 반복된다면 `@facet/core/runtime` 에 View 계약 interface 를 노출하는 것을 검토한다.
- payload 검증은 작고 초기에 한다. 내부 로직은 이미 좁혀진 값만 본다.

## Exception

- `packages/core/src/runtime/runner.ts` 의 `controlBar` / `metricsState` 주변 데이터는 공용 인터페이스 전에 만들어진 경로라 `Record<string, unknown>` 계열 cast 를 포함한다. 러너 내부 한정 예외 — 단 **추가 확산은 금지**. 새 코드는 반드시 정식 타입으로 좁혀서 작성한다.

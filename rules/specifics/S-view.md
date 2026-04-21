---
name: S-view
description: View Catalog 의 인터페이스 계약, design-tokens 경유 색상, theme/locale 파라미터 존중.
type: specific
version: 1
last_verified: 2026-04-21
---

# S-view. View Catalog 규율

## 적용 범위

- `packages/core/src/views/**/*.ts` — 표준 View 15종
- `packages/view-code/src/**/*.ts` — code-view 패키지

## MUST

- 모든 View 는 `packages/core/src/views/types.ts` 의 `View` 인터페이스를 구현한다. 즉 `mount(container: HTMLElement, params: ViewMountParams): ViewInstance` 를 export 한다.
- `ViewInstance.destroy()` 는 **모든** 부착 DOM 노드와 이벤트 리스너를 정리한다. 리소스 누수 금지.
- 색상은 `getColors(theme)` 로 현재 팔레트를 얻어서 사용한다. `design-tokens.ts` 의 `colors` / `lightColors` / `darkColors` 를 직접 참조해도 되지만, **리터럴 hex / rgb 하드코딩 금지**.
- 폰트 크기 / 여백은 `fontSizes` / `space` / `radii` 토큰을 경유한다.
- `params.locale` 이 있으면 View 내부 라벨을 해당 로캘로 해석한다. `packages/core/src/types/locale.ts` 의 `resolveLocale` 사용.
- `params.theme` 이 'dark' 일 때는 반드시 어두운 팔레트로 렌더한다. `light` 를 기본값으로 가정해도, theme 이 전달되면 즉시 반영.
- View 메서드 (Projector 가 호출하는 `setData` / `setItemState` 등) 는 동기로 즉시 반영하되, **애니메이션이 있는 메서드는 `Promise<void>` 반환** (runner 가 `await` 가능하도록).

## MUST NOT

- View 가 다른 View 를 import 하지 않는다 — View 조합은 layout-builder + mountBlocks 의 책임.
- View 가 `FacetJson` / `FacetRuntimeEvent` / `FacetContext` 를 import 하지 않는다. View 는 알고리즘 레이어의 존재를 몰라야 한다.
- View 가 전역 window / document 의 상태를 장기 구독하지 않는다. `ResizeObserver` 등을 쓰면 `destroy()` 에서 반드시 해제.
- 색상 / 폰트 / 간격을 리터럴로 하드코딩하지 않는다 (`'#ff0000'`, `'12px'` 등).

## PREFER

- View 가 많은 optional 기능을 가질 때는 `BarChartFeature` 처럼 **문자열 유니온 + features 배열** 로 선언 후 mount 시 활성화한다.
- Projector 와의 계약은 호출 가능한 메서드 집합으로 정의. 상태 필드를 Projector 에 노출하지 않는다 (캡슐화).
- 테스트는 `test/<view>.test.ts` 로 DOM 구조/이벤트 핸들링을 happy-dom 에서 검증.

## Exception

- `design-tokens.ts` 는 토큰 정의 자체이므로 리터럴 색상 값을 포함한다. 이 파일만 예외.

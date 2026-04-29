---
name: S-view
description: View Catalog 의 인터페이스 계약, design-tokens 경유 색상, theme/locale 파라미터 존중.
type: specific
version: 3
last_verified: 2026-04-29
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
- `params.dispatch` 가 주입되면 View 의 사용자 입력은 이 콜백으로만 발신한다. 페이로드는 `{ type: string; payload?: unknown }` 자유 구조이며, 해당 mechanism 이 정의한 입력 어휘에 맞춰야 한다. 미주입 시 View 는 정적 표시 모드로 동작 (사용자 입력 없는 경로).
- control-bar 의 외부 메서드 계약 (`onPlay` / `onStep` / `onPause` / `onReset` / `onSpeedChange` / `setRunning` / `setComplete` / `updateMetric` / `resetMetrics` / `getSpeed` / `setSpeed`) 은 runner 의 wire-up 과 mechanism hooks 가 의존하는 표면이다. 임의 제거 / 시그니처 변경 금지.

## MUST NOT

- View 가 다른 View 를 import 하지 않는다 — View 조합은 layout-builder + mountBlocks 의 책임.
- View 가 `FacetJson` / `FacetRuntimeEvent` / `FacetContext` / `Mechanism` 을 import 하지 않는다. View 는 알고리즘/메커니즘 레이어의 존재를 몰라야 한다.
- View 가 mechanism 인스턴스를 직접 참조하지 않는다 — 사용자 입력은 `params.dispatch` 콜백으로만 발신.
- View 가 전역 window / document 의 상태를 장기 구독하지 않는다. `ResizeObserver` 등을 쓰면 `destroy()` 에서 반드시 해제.
- 색상 / 폰트 / 간격을 리터럴로 하드코딩하지 않는다 (`'#ff0000'`, `'12px'` 등).

## PREFER

- View 가 많은 optional 기능을 가질 때는 `BarChartFeature` 처럼 **문자열 유니온 + features 배열** 로 선언 후 mount 시 활성화한다.
- Projector 와의 계약은 호출 가능한 메서드 집합으로 정의. 상태 필드를 Projector 에 노출하지 않는다 (캡슐화).
- 테스트는 `test/<view>.test.ts` 로 DOM 구조/이벤트 핸들링을 happy-dom 에서 검증.

## Exception

- `design-tokens.ts` 는 토큰 정의 자체이므로 리터럴 색상 값을 포함한다. 이 파일만 예외.
- `oklch.ts` 는 OKLCH ↔ sRGB 변환의 수학 상수만 포함하며 디자인 색은 들지 않는다. 별도 예외 사유 없이 도구 파일.

---

## 색 토큰 결정 트리 (통일안 v3, 2026-04)

이 절은 새 view / 새 facet 이 색을 쓰려 할 때 따라야 하는 단일 결정 흐름이다. 어휘는 `design-tokens.ts` 가 단일출처.

### 카테고리 어휘 (`Palette` 와 함수형 토큰)

- **structural** — `bg` / `bgSubtle` / `border` / `text` / `textMuted` / `textInverse`. 정보 hierarchy.
- **emphasis** — `accent` (단일 강조 노랑 #facc15), `primary` / `primaryHover`.
- **state** — `itemDefault` / `itemComparing` (주황) / `itemSwapping` (빨강) / `itemSorted` (회/흰) / `itemPivot` (노랑=accent) / `itemActive` (주황). **알고리즘 상태**의 어휘이며 새 상태를 임의로 추가하면 view 간 어휘 동기화가 깨진다.
- **severity** — `danger` (빨강 #dc2626), `success`. 오류/완료 신호.
- **region** — `sortedTailBg/Border` (정렬 꼬리), `subtreeShadeLeft/Right` (좌소우대 색지). 영역 tint.
- **special** — `risingMarker` / `auxCursor` / `ghostOutline`. 단일 의미 픽셀.
- **iso-body** — `isoBodyMain` / `isoBodySide`. isometric 막대 본체 (상태 무관 옅은 중성). bar-chart / snapshot-strip / goal-preview 가 공유.
- **함수형 토큰** — `categorical(count, tone)` (OKLCH 등간격 hue 자동 생성), `depthVeil(depth, theme)` (깊이 명도 변조), `shiftLightness(hex, deltaL)` (한 색의 밝기 단계).
- **`ledTokens`** — LED 메타포 전용 const (테마 무관 고정). 전광판 / 캡 라벨 / 블록 stamp / 파이프 stroke 등 "LED·라벨" 로 읽혀야 하는 자리. `Palette` 가 아니므로 테마 분기 없음.

### 결정 순서

색을 쓰려 할 때 위에서 아래로 내려오면서 가장 먼저 매치되는 카테고리를 사용한다:

1. 알고리즘 상태인가? → **state** (`itemComparing` 등). 새 상태가 필요하면 어휘 확장 자체를 PR 로 분리.
2. 오류/긍정 신호인가? → **severity** (`danger` / `success`).
3. n 개 카테고리 식별 (스택 박스 stamp / 큐 IN/OUT 등) 인가? → **categorical(n, tone)** + 인덱스 named export. 큐형은 `CATEGORICAL_QUEUE_BLOCK/IN/OUT` 재사용.
4. 깊이 인지가 필요한가? → **depthVeil(depth, theme)**.
5. 한 main 색의 밝기 단계 (3D shading 등) 가 필요한가? → **shiftLightness(main, ±deltaL)**.
6. isometric 본체인가? → **iso-body**.
7. LED·라벨 메타포인가? → **ledTokens** import.
8. 영역 tint / 단일 의미 픽셀인가? → **region** / **special**.
9. 위 어디에도 안 맞으면 → **structural** (`bg` / `text` 등).

### MUST (통일안)

- **facet 영역 색 hex/rgba 0건** — `facets/**/*.ts` (algorithm / projector / facet.json / description / index) 어디에도 색 리터럴 금지. Projector 는 view 메서드 호출만 한다 (색은 view 가 토큰에서 받음).
- **state 어휘 동기화** — `BarItemState` / 트리·그래프 노드 상태 등 동일 의미 상태는 동일 토큰 키를 쓴다. 같은 의미에 다른 색 분기 금지.
- **view-local 토큰 객체 (`CQ_TOKENS` 등) 안의 hex 금지** — 모든 값은 `colors.*` / `ledTokens.*` / `categorical(...)` / `shiftLightness(...)` 등 design-tokens 표현식의 결과여야 한다.
- **새 카테고리·새 토큰은 `design-tokens.ts` 에 추가**한 뒤 `runtime/index.ts` 에서 re-export 한다. 외부 패키지·facet 은 토큰을 `@facet/core/runtime` 으로만 받는다 (C7 정합).
- **흑백 정체성 폐기** (2026-04 결정) — "구조 = 흑백 + 노랑 단일 강조" 는 더 이상 정체성이 아니다. 새 view 가 무채색에 갇힐 의무 없음. 의미별 분화가 우선.

### Exception (view-local 허용)

- `hexToRgba(hex, alpha)` 같은 **순수 변환 함수** 는 색 리터럴이 아니므로 view 에 둘 수 있다 (입력 hex 는 토큰 경유).
- view 가 categorical 시드의 어떤 인덱스를 쓰는지 결정하는 매직 넘버는 **named 상수로 끌어올려 `design-tokens.ts` 에 두는** 것을 원칙으로 한다 (`CATEGORICAL_QUEUE_*`). view-local 인덱스 상수는 다른 view 가 같은 의미를 재현할 일이 없을 때만.

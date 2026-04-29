---
version: 2
last_verified: 2026-04-29
---

# FACET Principles (Tier 1)

> 모든 코드에 항상 적용되는 핵심 원칙. 개별 Concern / Specific 이 이 원칙의 구체화다.
> 원칙과 concern/specific 이 충돌하는 경우 원칙이 우선한다.

## 1. 4-layer 방향성

- 의존성 방향은 **Runner → JSON → Projector → Algorithm** 이다. 역방향 import 금지.
- 특히 **Algorithm 은 View 를 직접 참조하지 않는다**. 둘의 접점은 `FacetRuntimeEvent` 어휘 + 식별자 문법뿐이다.
- **View 는 Algorithm 을 참조하지 않는다**. View 는 데이터와 자체 메서드만 안다.
- **Projector 만 양쪽을 안다** — 이벤트를 View 메서드 호출로 번역하는 것이 유일한 책임.
- Runner 와 Algorithm 사이의 진행 동력 (mode / cancelled / timer / ctx 등) 은 **`Mechanism` 추상에 캡슐화**된다. runner 는 mechanism 을 외부 인터페이스 (control-bar / View) 와 연결하는 어댑터 역할만 한다. ctx 는 mechanism 외부에 노출되지 않는다.

## 2. DSL 최소성

- 호스트가 보는 DSL 은 `{facet:<id>}` 가 전부다. DSL 확장 금지.
- 모든 구체 — 데이터 · 레이아웃 · 시각화 종류 · 메트릭 · 코드 패널 — 은 `FacetJson` 에 선언한다. `FacetJson` 에 런타임 로직/함수를 넣지 않는다.

## 3. 레지스트리 경유

- Algorithm / Projector / IR / Transpiler / View / Facet / Description 은 `@facet/core/runtime` 의 `register*` 함수를 통해서만 시스템에 등록된다.
- 소비자는 반드시 `get*` 계열로 조회한다. 다른 패키지의 구체 구현 파일을 직접 import 해서 쓰지 않는다.
- `FacetJson.algorithm` / `projector` 는 `module:<name>` 참조 문자열만 허용한다. 함수 리터럴 금지.

## 4. 이벤트 어휘 + 식별자 문법

- 표준 이벤트 (`StandardEventType`) 와 표준 식별자 prefix (`index:`, `node:`, `edge:`, `queue:`, `list:`, `tree:`) 를 우선 사용한다.
- facet 고유 확장 이벤트는 허용되지만, 반드시 해당 `algorithm.ts` 상단 주석에 **이벤트 목록 + payload 스키마** 를 문서화한다.
- 식별자 파싱은 `parseTarget` 을 경유한다. 각 Projector 가 정규식을 인라인으로 쓰지 않는다.

## 5. Projector 가 유일한 번역기

- 알고리즘 이벤트 → View 메서드 호출의 매핑은 Projector 안에서만 수행한다.
- View 가 이벤트를 해석하지 않는다. 러너가 View 를 직접 조작하지 않는다. (러너는 `onInit` / `onEvent` / `onReset` 로 Projector 만 호출.)
- Projector 는 시각 상태를 독자적으로 관리해도 되지만, **데이터 원본은 알고리즘의 `ctx.data`** 이며 Projector 는 필요한 만큼만 shadow-copy 해 추적한다.
- 짝 원칙: View → Algorithm/Mechanism 의 사용자 입력 채널은 **`mechanism.dispatch` 단일 경로**다. control-bar 클릭은 `mechanism.onControl` 로, View 위젯 입력은 `mechanism.dispatch` 로 직교 분리되며, 두 경로 외의 우회 경로 (View 가 algorithm/mechanism 을 직접 참조 등) 를 만들지 않는다.

## 6. View Catalog 재사용 우선

- 새 facet 을 추가할 때, 기존 View (`packages/core/src/views/*` + `@facet/view-code`) 로 표현 가능하면 **새 View 를 만들지 않는다**.
- 새 View 는 둘 이상의 facet 이 공유할 수 있을 때만 만든다. 한 facet 전용 시각화는 facet 패키지 안에 두되, 재사용성이 생기면 Catalog 로 승격한다.
- View 는 색상 / 폰트 / 여백을 `design-tokens` 경유로 획득한다. 하드코딩 금지.

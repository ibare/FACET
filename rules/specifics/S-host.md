---
name: S-host
description: 호스트 어댑터 (Tiptap NodeView) 의 DSL 파서 격리, facet lazy load, 코어 비침투, 카탈로그 단일출처, 외부 배포 번들의 얇은 포장 원칙.
type: specific
version: 2
last_verified: 2026-04-28
---

# S-host. Host 어댑터 규율

## 적용 범위

- `packages/host-tiptap/**/*.ts` — 호스트 어댑터 본체 (Tiptap NodeView)
- `packages/host-tiptap-bundle/**` — 외부 호스트 (예: methii) 용 self-contained ESM 번들 패키지
- `packages/bootstrap/**` — facet 카탈로그 단일 출처 (register* 통합 진입)
- 이후 추가될 호스트 어댑터 패키지 (`@facet/host-markdown`, `@facet/host-react` 등)

## 책임 분리

세 종류의 패키지가 각기 다른 책임을 진다.

- **호스트 어댑터 본체** (`host-tiptap`) — DSL 파싱 + NodeView 정의. 런타임/카탈로그를 모른다.
- **카탈로그 통합** (`bootstrap`) — `register*` 호출만 모아둔 부팅 진입점. 어떤 facet/view/transpiler 가 시스템에 존재하는지를 단일 출처로 선언.
- **외부 배포 번들** (`host-tiptap-bundle`) — 외부 호스트 앱이 단일 의존으로 소비하는 ESM tarball. 본체와 bootstrap 을 얇게 re-export 만 한다.

## MUST

### 호스트 어댑터 본체 (host-tiptap)

- 호스트 어댑터는 DSL 문법 (`{facet:<id>}`) 파싱을 **자기 파일 안에서** 수행한다. 파서를 `@facet/core` 에 집어넣지 않는다. DSL 은 호스트의 관심사.
- 호스트는 `@facet/core/runtime` 의 `loadFacet(id)` 또는 `getFacetById(id)` 로 facet JSON 을 조회한다. registry 내부 Map 을 직접 만지지 않는다.
- `{facet:<id>}` 의 `<id>` 는 full facet id (`facet:bubbleSort`) 또는 수락 가능한 shorthand 를 호스트 파서가 정규화한다 (기존 구현은 full id 전제).
- facet 이 미등록이고 `registerFacetLoader` 로 lazy loader 만 있는 경우, 호스트는 `loadFacet` 을 `await` 해서 받아온 뒤 NodeView 를 마운트한다.
- NodeView 의 DOM 컨테이너는 마운트 완료 후 `runFacet(json, mountEl)` 의 결과 handle 을 저장해 `destroy()` 타이밍에 호출한다 (메모리 누수 방지).
- 호스트 어댑터 본체는 `@facet/core/runtime` 의 subpath 하나만 의존한다. 구체 algorithm/projector/view/transpiler 패키지에 대한 의존은 **카탈로그 통합 패키지** (`@facet/bootstrap`) 또는 **호스트 앱** (playground) 이 진다.

### 카탈로그 통합 (bootstrap)

- facet 카탈로그 — 어떤 algorithm/view/transpiler 가 존재하고 어떻게 lazy load 되는지 — 는 `packages/bootstrap/src/index.ts` **한 곳** 에서만 선언한다. 호스트별로 같은 매핑을 중복 선언하지 않는다.
- bootstrap 은 `register*` 함수 호출만 한다. 시각화 / DSL / NodeView 코드를 두지 않는다.
- bootstrap 의 facet 등록은 반드시 `registerFacetLoader('facet:<id>', () => import('@facet/algorithm-<x>').then(...))` 형식이다. 정적 import 로 algorithm 패키지를 끌어오면 번들러의 dynamic import 경계가 깨져 facet 별 chunk lazy 분리가 무너진다.
- `bootstrapFacet()` 은 멱등이어야 한다 (동일 호스트 내 중복 호출에 안전).

### 외부 배포 번들 (host-tiptap-bundle)

- host-tiptap-bundle 은 본체 + bootstrap 을 **re-export 만** 한다. 자체 로직 (DSL 파서, register 호출, View 정의 등) 을 두지 않는다.
- 외부 호스트가 단일 import 로 사용할 수 있도록 `FacetExtension` / `bootstrapFacet` 등 호스트 통합에 필요한 공개 표면만 export 한다.
- rollup 설정은 dynamic import (`import('@facet/algorithm-*')`) 가 chunk 경계로 살아남도록 유지한다 (`inlineDynamicImports: false`, manualChunks 로 facet/runtime 명시 분리).

## MUST NOT

- 호스트 어댑터가 `FacetContext` / Projector 를 직접 다루지 않는다. 러너가 감추는 추상을 깨지 않는다.
- DSL 파싱 결과를 전역 상태로 저장하지 않는다. 파서는 pure.
- NodeView 가 `document.body` 에 임의 요소를 붙이지 않는다. 반드시 NodeView 가 관리하는 DOM 트리 안에.
- **host-tiptap-bundle 이 `@facet/algorithm-*` / `@facet/transpiler-*` / `@facet/view-*` 를 직접 의존하지 않는다.** 반드시 `@facet/bootstrap` 경유.
- bootstrap 이 호스트 어댑터 (`@facet/host-tiptap`) 나 외부 배포 번들 (`@facet/host-tiptap-bundle`) 을 import 하지 않는다. 의존 방향은 `host-tiptap-bundle → {host-tiptap, bootstrap} → core/runtime + algorithm/view/transpiler` 일방향.

## PREFER

- 마크다운 호스트와 Tiptap 호스트가 DSL 파서 로직을 공유한다면, 공용 파서를 새 패키지 (`@facet/host-dsl` 등) 로 분리한다. `@facet/core` 에 DSL 을 밀어넣지 않는다.
- 테스트는 `test/extension.test.ts` 처럼 happy-dom + Tiptap 최소 editor 로 DSL → NodeView 렌더 경로를 E2E 로 검증.
- 새 호스트 어댑터를 추가할 때도 카탈로그는 `@facet/bootstrap` 을 그대로 재사용한다 (호스트마다 새 카탈로그 패키지를 만들지 않는다).

## Exception

- 테스트 편의를 위해 `test/extension.test.ts` 는 `@facet/algorithm-*`, `@facet/transpiler-*`, `@facet/view-code` 를 devDependencies 로 import 할 수 있다. 테스트 외 경로에서는 금지.
- 호스트 앱 (`apps/playground`) 은 C7 Exception 에 따라 모든 `@facet/*` 공개 API 를 자유롭게 import 할 수 있다. 다만 카탈로그 통합은 직접 register* 호출 대신 `@facet/bootstrap` 의 `bootstrapFacet()` 을 호출하는 것을 권장한다.

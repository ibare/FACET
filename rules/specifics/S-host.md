---
name: S-host
description: 호스트 어댑터 (Tiptap NodeView) 의 DSL 파서 격리, facet lazy load, 코어 비침투 원칙.
type: specific
version: 1
last_verified: 2026-04-21
---

# S-host. Host 어댑터 규율

## 적용 범위

- `packages/host-tiptap/**/*.ts`
- 이후 추가될 호스트 어댑터 패키지 (`@facet/host-markdown`, `@facet/host-react` 등)

## MUST

- 호스트 어댑터는 DSL 문법 (`{facet:<id>}`) 파싱을 **자기 파일 안에서** 수행한다. 파서를 `@facet/core` 에 집어넣지 않는다. DSL 은 호스트의 관심사.
- 호스트는 `@facet/core/runtime` 의 `loadFacet(id)` 또는 `getFacetById(id)` 로 facet JSON 을 조회한다. registry 내부 Map 을 직접 만지지 않는다.
- `{facet:<id>}` 의 `<id>` 는 full facet id (`facet:bubbleSort`) 또는 수락 가능한 shorthand 를 호스트 파서가 정규화한다 (기존 구현은 full id 전제).
- facet 이 미등록이고 `registerFacetLoader` 로 lazy loader 만 있는 경우, 호스트는 `loadFacet` 을 `await` 해서 받아온 뒤 NodeView 를 마운트한다.
- NodeView 의 DOM 컨테이너는 마운트 완료 후 `runFacet(json, mountEl)` 의 결과 handle 을 저장해 `destroy()` 타이밍에 호출한다 (메모리 누수 방지).
- 호스트는 `@facet/core/runtime` 의 subpath 하나만 의존한다. 구체 algorithm/projector/view/transpiler 패키지에 대한 의존은 **호스트 앱** (playground) 이 진다.

## MUST NOT

- 호스트 어댑터가 `FacetContext` / Projector 를 직접 다루지 않는다. 러너가 감추는 추상을 깨지 않는다.
- DSL 파싱 결과를 전역 상태로 저장하지 않는다. 파서는 pure.
- NodeView 가 `document.body` 에 임의 요소를 붙이지 않는다. 반드시 NodeView 가 관리하는 DOM 트리 안에.

## PREFER

- 마크다운 호스트와 Tiptap 호스트가 DSL 파서 로직을 공유한다면, 공용 파서를 새 패키지 (`@facet/host-dsl` 등) 로 분리한다. `@facet/core` 에 DSL 을 밀어넣지 않는다.
- 테스트는 `test/extension.test.ts` 처럼 happy-dom + Tiptap 최소 editor 로 DSL → NodeView 렌더 경로를 E2E 로 검증.

## Exception

- 테스트 편의를 위해 `test/extension.test.ts` 는 `@facet/algorithm-*`, `@facet/transpiler-*`, `@facet/view-code` 를 devDependencies 로 import 할 수 있다. 테스트 외 경로에서는 금지.

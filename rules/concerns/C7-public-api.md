---
name: C7 공개 API 경계
description: 패키지 간 import 는 해당 패키지의 지정된 entry (src/index.ts 또는 @facet/core/runtime 같은 subpath) 만 사용한다. 내부 구현 파일의 직접 import 금지.
type: concern
version: 1
last_verified: 2026-04-21
---

# C7. 공개 API 경계

## When to Apply

- 다른 패키지 (`@facet/*`) 의 심볼을 import 할 때
- 새 패키지를 만들 때 / 기존 패키지에 새 export 를 추가할 때

## MUST

- 다른 패키지 import 는 다음 경로만 허용한다:
  - `@facet/core` — IR / Transpiler 타입
  - `@facet/core/runtime` — runtime 서브시스템 (register*, FacetContext, ProjectorFactory, StandardEventType, parseTarget, View Catalog 등)
  - `@facet/<packageName>` — 해당 패키지의 `package.json::main`/`exports.'.'` 가 가리키는 `src/index.ts`
- 패키지의 **모든 public symbol** 은 해당 패키지 `src/index.ts` 에서 export 되어야 한다. 내부 파일 경로를 바깥으로 노출하지 않는다.
- 새 export 를 추가할 때는 `src/index.ts` 를 같은 commit 에서 수정한다 — 내부에서 `import { x } from './module.js'` 는 자유, 그러나 외부 노출은 `index.ts` 경유만.

## MUST NOT

- `@facet/core/src/runtime/registry.js` 처럼 **내부 구현 경로** 로 다른 패키지에서 import 하지 않는다.
- `../../../packages/core/src/...` 처럼 **상대 경로로 다른 패키지를 깊이 참조** 하지 않는다. 같은 패키지 내부가 아니면 반드시 `@facet/*` 절대 import.
- `package.json::exports` 에 명시되지 않은 subpath 를 추가로 생성하지 않는다 (`@facet/core` 는 `.` 와 `./runtime` 두 개만 허용).

## PREFER

- 내부 모듈 간 import 는 `.js` 확장자 포함 (ESM) 관례를 따른다 — 기존 코드가 `./algorithm.js` 스타일이다.
- 새 타입을 여러 패키지에서 쓴다면 `@facet/core` 에 올려 중앙화한다.

## Exception

- `test/**/*.test.ts` 는 테스트 편의상 다른 facet 패키지의 심볼을 직접 import 할 수 있다 (예: `host-tiptap/test/extension.test.ts::@facet/algorithm-bubblesort`). 테스트 dependencies 가 devDependencies 에 선언되어 있다면 허용.
- `apps/playground` 는 호스트 앱이므로 모든 `@facet/*` 패키지의 공개 API 를 자유롭게 import 할 수 있다.

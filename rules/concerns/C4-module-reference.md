---
name: C4 모듈 참조 문자열 정합
description: module:/ir:/transpiler:/facet: 참조 문자열은 실제 register* 에 등록된 이름/id 와 반드시 일치한다.
type: concern
version: 1
last_verified: 2026-04-21
---

# C4. 모듈 참조 문자열 정합

## When to Apply

- `FacetJson.algorithm: 'module:<name>'` / `projector: 'module:<name>'` 작성
- `FacetJson.blocks.<ref>.type === 'code-view'` 의 `ir: 'ir:<id>'` / `transpiler: 'transpiler:<id>'` 작성
- `FacetJson.id: 'facet:<name>'` 작성
- `description.ts` 본문에 `{facet:<id>}` DSL 토큰 삽입
- `registerAlgorithm/Projector/IR/Transpiler/Facet` 호출

## MUST

- 같은 facet 패키지의 `index.ts::register<Name>()` 에서 `registerAlgorithm('<name>', ...)` 의 `<name>` 과 `facet.ts` 의 `algorithm: 'module:<name>'` 의 `<name>` 은 **문자 단위로 일치**해야 한다. `projector` / `ir` / `transpiler` 도 동일.
- `FacetJson.id` 는 `facet:<Name>` 형식. `<Name>` 은 camelCase (예: `facet:bubbleSort`, `facet:binarySearch`) — 기존 18개 facet 의 관습을 따른다.
- `description.ts` 본문에 `{facet:<Name>}` 가 나오면 그 `<Name>` 은 **같은 패키지의** `facet.ts::id` 와 정확히 일치해야 한다. 다른 facet 을 참조하려면 그 facet 의 id 를 그대로 쓴다.
- IR id (`bubblesort-imperative` 같은) 는 kebab-case. `registerIR(ir.id, ir)` 와 `code-view.ir: 'ir:<id>'` 가 일치해야 한다.
- Transpiler id 는 언어 이름 단일 소문자 (`python`, `java`, `javascript` 등).

## MUST NOT

- `module:` / `ir:` / `transpiler:` prefix 를 공백/대소문자 변형으로 작성하지 않는다 (반드시 소문자 + 콜론).
- 참조 문자열을 `` `module:${name}` `` 같은 동적 조립으로 쓰지 않는다. 리터럴만.
- 한 `register*` 호출의 이름을 여러 파일에서 중복 등록하지 않는다 (이후 등록이 이전을 덮는다 — silent override).

## PREFER

- `register<Name>()` 은 한 패키지에서 **한 번만** 호출되도록 구성한다. 부수효과가 있는 import 대신 명시적 `register<Name>()` 호출을 호스트 앱 bootstrap 에서 수행.
- 새 facet 등록 헬퍼를 만들 때는 기존 facet (예: `facets/cs-fundamentals/bubblesort/src/index.ts::registerBubblesort`) 을 모범으로 참조한다.

## Exception

- 러너 내부의 `stripPrefix(ref, 'module')` 같은 prefix 제거 로직은 구현 자체이므로 이 규칙의 대상이 아니다.

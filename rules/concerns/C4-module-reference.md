---
name: C4 모듈 참조 문자열 정합
description: module:/ir:/transpiler:/facet: 참조 문자열은 실제 register* 에 등록된 이름/id 와 반드시 일치한다.
type: concern
version: 2
last_verified: 2026-09-05
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
- `FacetJson.id` 는 `facet:<Name>` 형식. `<Name>` 은 **lowerCamelCase 단일 세그먼트** (예: `facet:bubbleSort`, `facet:queueFifo`). 아래 "facet id 명명 규칙" 을 따른다.
- `description.ts` 본문에 `{facet:<Name>}` 가 나오면 그 `<Name>` 은 **같은 패키지의** `facet.ts::id` 와 정확히 일치해야 한다. 다른 facet 을 참조하려면 그 facet 의 id 를 그대로 쓴다.
- IR id (`bubblesort-imperative` 같은) 는 kebab-case. `registerIR(ir.id, ir)` 와 `code-view.ir: 'ir:<id>'` 가 일치해야 한다.
- Transpiler id 는 언어 이름 단일 소문자 (`python`, `java`, `javascript` 등).
- **`registerAlgorithm` / `registerProjector` 의 이름은 lowerCamelCase 단일 세그먼트**이며,
  projector 는 `<name>Projector` 로 끝난다. 둘이 같은 이름을 쓰면 (`'depthDoublesCount'`
  가 알고리즘이자 projector) 레지스트리가 갈라져 있어 동작은 하지만 `module:` 참조만
  보고는 어느 쪽인지 알 수 없다. **view 이름만 kebab-case** (`<디렉터리명>-stage`) 다 —
  DOM 쪽 어휘와 붙어 있어서다. 조각 스물에서 넷이 이 셋을 뒤섞어 kebab 으로 등록하거나
  `Projector` 접미를 빠뜨렸다.

## facet id 명명 규칙

1. **넓은 말을 앞에, 변별어를 뒤에 둔다.** `queueFifo` ○ / `fifoQueue` ✗.
   정렬하면 형제가 저절로 모이고 `id.startsWith('facet:queue')` 로 계열을 찾을 수 있다.
   이것이 계층 표기 (`facet:queue:fifo`) 의 유일한 실질 이득인 그룹핑을 대체한다.
2. **같은 일반 명사를 쓰는 형제가 있거나 생길 수 있으면 변별어를 붙인다.**
   큐는 우선순위 큐 · 원형 큐 · 덱이 모두 "큐" 를 자칭하므로 `facet:queue` 가 아니라
   `facet:queueFifo` 다. `facet:queue` 로 두면 형제가 추가된 뒤 그 하나만 이름이 넓은
   비대칭이 영구화되고, `{facet:queue}` 봉투를 봐도 어느 큐인지 알 수 없다.
3. **변별이 필요 없으면 붙이지 않는다.** 모든 스택이 LIFO 이므로 `facet:stack` 은
   그대로 둔다. 쓰지도 않을 변별어는 id 를 길게만 만든다.
4. **계층을 id 문자열에 넣지 않는다.** `facet:queue:fifo` 같은 다중 세그먼트를 쓰지
   않는다. 근거 셋 —
   - 호스트 DSL 파서 (`packages/host-tiptap/src/markdown.ts`) 의 토큰 정규식이
     `facet:` 뒤에 콜론을 허용하지 않는다.
   - 계층 표기를 도입하면 "어디까지 계층화하나" 라는 판단이 끝없이 생긴다
     (`facet:sort:bubble` 은? tree 계열은? graph 계열은?). 단일 세그먼트는 그 판단이 없다.
   - facet 사이의 상하 관계는 이미 `@ffacet/authoring` 의 개념 스키마
     (`canonicalFacet` / `aspects` / `specializes`) 가 표현한다. id 문자열에 또 담으면
     같은 정보가 두 곳에 있게 되고 언젠가 어긋난다. 같은 일반 명사를 공유하는
     facet 들은 상하가 아니라 **형제** 다.

5. **`title` 은 변별어를 지지 않는다.** id 가 변별을 맡았으니 제목은 사람이 부르는
   이름을 쓴다 — 카탈로그 카드의 이름과 같아야 한다.

   | 카드 | id | title |
   | --- | --- | --- |
   | 연결 리스트 | `linkedListSingly` | 연결 리스트 |
   | 해시 테이블 | `hashTableChaining` | 해시 테이블 |
   | 힙 | `heapBinary` | 힙 |

   괄호를 붙이는 자리는 **통용되는 별칭**뿐이다 — `스택 (LIFO)` · `큐 (FIFO)` ·
   `이진 탐색 트리 (BST)`. 이것들은 변별어가 아니라 같은 것의 다른 이름이다.

   구현이 무엇을 골랐는지(최소 힙인지 최대 힙인지, 체이닝인지 개방 주소법인지)는
   `description` 이 진다. 화면을 읽는 데 필요한 성질이지 이름이 아니다.

   어긴 적이 있다. `heapBinary` 의 제목을 "이진 힙" 으로 두었더니 카드에서 "힙" 을
   누르고 들어온 사람이 다른 것을 만난 것처럼 읽혔다. 규약이 어디에도 적혀 있지
   않아서 생긴 일이다.

개념 id (`@ffacet/authoring` 의 `FacetConceptSource.id`) 도 같은 1~4 규칙을 따른다.
다만 개념 id 와 facet id 가 같을 필요는 없다 — 대응은 `canonicalFacet` 이 명시하며,
개념이 aspect 를 여럿 거느리면 애초에 같을 수 없다.

## MUST NOT

- `module:` / `ir:` / `transpiler:` prefix 를 공백/대소문자 변형으로 작성하지 않는다 (반드시 소문자 + 콜론).
- 참조 문자열을 `` `module:${name}` `` 같은 동적 조립으로 쓰지 않는다. 리터럴만.
- 한 `register*` 호출의 이름을 여러 파일에서 중복 등록하지 않는다 (이후 등록이 이전을 덮는다 — silent override).
- facet id 에 콜론을 두 번 쓰지 않는다 (`facet:queue:fifo` 금지 — 위 명명 규칙 4).

## PREFER

- `register<Name>()` 은 한 패키지에서 **한 번만** 호출되도록 구성한다. 부수효과가 있는 import 대신 명시적 `register<Name>()` 호출을 호스트 앱 bootstrap 에서 수행.
- 새 facet 등록 헬퍼를 만들 때는 기존 facet (예: `facets/cs-fundamentals/bubblesort/src/index.ts::registerBubblesort`) 을 모범으로 참조한다.

## Exception

- 러너 내부의 `stripPrefix(ref, 'module')` 같은 prefix 제거 로직은 구현 자체이므로 이 규칙의 대상이 아니다.

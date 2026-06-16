# @ffacet/host-tiptap-bundle

FACET 알고리즘 시각화를 Tiptap / ProseMirror 에디터에 통합하는 **self-contained ESM 번들**이다. `@ffacet/host-tiptap` + 19종 facet 시각화 모듈(algorithm / projector / IR / view) + 트랜스파일러 6종 + 코드 패널 View 를 하나로 묶어, 외부 호스트 앱이 **단일 의존**으로 소비한다.

## 설치

```sh
npm install @ffacet/host-tiptap-bundle @ffacet/core @tiptap/core @tiptap/pm
```

`peerDependencies`:
- `@ffacet/core` — facet 등록(`bootstrapFacet`)과 재생(`runFacet`)이 동일 registry 인스턴스를 공유하도록 호스트에 단일 인스턴스로 설치한다.
- `@tiptap/core`, `@tiptap/pm` — 호스트의 Tiptap 단일 인스턴스를 공유한다.

## 사용

```ts
import { FacetExtension, bootstrapFacet } from '@ffacet/host-tiptap-bundle';
import { Editor } from '@tiptap/core';

bootstrapFacet();                                    // 앱 부팅 시 1회 — facet 카탈로그 등록

const editor = new Editor({
  extensions: [
    FacetExtension,
    // ...다른 Tiptap 익스텐션
  ],
});
```

`bootstrapFacet()` 은 View / 트랜스파일러를 정적 등록하고, 각 facet 시각화 모듈은 **lazy dynamic import** 로 남겨둔다. 번들의 `dist/facets/*.js` chunk 가 그 그래프를 보존하므로, 호스트 번들러(Vite 등)가 facet 을 실제 사용하는 시점에만 로드한다.

### 시각화 모듈을 로드하지 않고 목록만 조회

```ts
import { getFacetCatalog } from '@ffacet/host-tiptap-bundle';

const catalog = getFacetCatalog(); // [{ id, title, description, domain }, ...]
```

`getFacetCatalog()` 는 facet chunk 를 로드하지 않고 빌드타임 매니페스트만 동기 조회한다. "추가 가능한 시각화 목록" UI 등에 쓴다.

## 공개 API

| export | 설명 |
| --- | --- |
| `FacetExtension` | facet NodeView 를 제공하는 Tiptap 익스텐션 |
| `FacetExtensionOptions` | 익스텐션 옵션 타입 |
| `bootstrapFacet()` | 앱 부팅 시 1회 호출 — 카탈로그 단일 출처 등록 |
| `getFacetCatalog()` | facet 모듈 미로드 상태로 추가 가능 시각화 목록 조회 |
| `FacetCatalogEntry` | 카탈로그 항목 타입 |
| `parseFacetRaw` | facet DSL 원시 파싱 |
| `createFacetNodeView` | NodeView 팩토리 |
| `renderFacetMarkdown` | facet 마크다운 렌더 |

## 라이선스

MIT

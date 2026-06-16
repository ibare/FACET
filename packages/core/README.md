# @ffacet/core

FACET 알고리즘 시각화의 **4-layer 러너 코어**다. facet JSON 을 받아 View 를 mount 하고 algorithm 을 재생하는 런타임(`runFacet`/`loadFacet`), facet/view/transpiler registry, 그리고 IR·이벤트·레이아웃 타입의 단일 출처다.

## 설치

```sh
npm install @ffacet/core
```

## 사용

```ts
import { runFacet, loadFacet } from '@ffacet/core/runtime';

const json = await loadFacet('facet:bubbleSort');
const handle = runFacet(json, mountEl, { autoStart: true });
```

## export 진입점

| 진입점 | 내용 |
| --- | --- |
| `@ffacet/core` | IR 타입 + `./runtime` 전체 재공개 |
| `@ffacet/core/runtime` | `runFacet` / `loadFacet` / registry / View / projector / 이벤트·레이아웃·locale 타입 |

## registry 단일 인스턴스

`@ffacet/core` 와 `@ffacet/core/runtime` 은 동일한 registry 인스턴스를 공유한다. `@ffacet/bootstrap`(facet 등록)과 이 패키지의 `runFacet`(재생)이 같은 registry 를 보려면, 호스트 앱에 **`@ffacet/core` 가 단일 인스턴스로 설치**되어야 한다. 그래서 `@ffacet/bootstrap`·`@ffacet/host-tiptap-bundle` 은 core 를 `peerDependency` 로 둔다.

## 라이선스

MIT

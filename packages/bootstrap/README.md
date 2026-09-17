# @ffacet/bootstrap

FACET facet **카탈로그 단일 출처**다. View·트랜스파일러 6종을 정적 등록하고, algorithm facet 19종을 lazy loader(`import()`)로 등록한다. facet 모듈을 로드하지 않고도 추가 가능한 시각화 목록을 조회하는 빌드타임 카탈로그를 제공한다.

## 설치

```sh
npm install @ffacet/bootstrap @ffacet/core
```

`@ffacet/core` 는 `peerDependency` 다 — 호스트의 단일 registry 인스턴스를 공유하기 위해 직접 설치해야 한다. `@ffacet/core` 의 registry 단일 인스턴스 설명을 참고하라.

## 사용

```ts
import { bootstrapFacet, getFacetCatalog } from '@ffacet/bootstrap';

bootstrapFacet(); // 앱 부팅 시 1회 — View/트랜스파일러 등록 + facet lazy loader 매핑

const catalog = await getFacetCatalog('ko'); // facet 모듈 미로드
// catalog.locale   — 실제로 담긴 언어 (없는 언어를 달라고 하면 'en')
// catalog.domains  — [{ id, name, subdomains: [{ id, name }] }]  분야 이름표
// catalog.facets   — [{ id, title, description, domain, subdomain }]
```

`bootstrapFacet()` 호출 후, 각 facet 은 실제 재생 시점에 lazy chunk 로 로드된다. `getFacetCatalog()` 는 facet chunk 를 로드하지 않고, 빌드타임에 만든 카탈로그 중 **요청한 언어 하나**만 불러온다. 문자열은 이미 그 언어로 골라져 있다. 순서는 분야 → 하위 분야 → facet 이라 그대로 묶어 그리면 된다.

제목·설명은 각 facet 의 `facet.ts`, 분야는 저장소의 `taxonomy/taxonomy.json` 이 원본이다.

## 공개 API

| export | 설명 |
| --- | --- |
| `bootstrapFacet()` | View/트랜스파일러 정적 등록 + facet lazy loader 매핑 (부팅 시 1회) |
| `getFacetCatalog(locale?)` | facet 모듈 미로드 상태로 추가 가능 시각화 목록을 한 언어로 불러온다 (Promise) |
| `FacetCatalog` · `FacetCatalogEntry` · `FacetCatalogDomain` · `FacetCatalogSubdomain` | 카탈로그 타입 |

## 라이선스

MIT

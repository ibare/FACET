# 릴리스 노트

`@ffacet/core` · `@ffacet/bootstrap` · `@ffacet/host-tiptap-bundle` · `@ffacet/authoring` 넷은
같은 버전으로 함께 발행된다(lockstep). 한 패키지만 바뀌어도 넷 다 오른다.

0.7.0 까지의 내역은 git 태그 메시지(`git show v0.7.0`)에 있다.

## 0.9.1 — 2026-09-29

API 와 화면은 바뀌지 않았다. 조각 두 개의 화면 문안에서 자리 이름을 바꿨다.

### 문안 자리 이름에서 `entry` 를 뺐다

호스트는 문안 자리 이름으로 `tool` · `entry` · `language` 를 받지 않는다. 951 개 가운데 이
셋을 쓴 것은 조각 둘의 `{entry}` 뿐이었다.

| facet | 문안 키 | 전 | 후 |
| --- | --- | --- | --- |
| `facet:inlineGrowsCode` | `caption.start` · `label.execSub` | `{entry}` | `{caller}` |
| `facet:splitBrain` | `detail.start` | `{entry}` | `{record}` |

- 값을 채운 뒤 화면에 뜨는 글자는 그대로다.
- 개념 메타의 `screen.labels` 에서 두 facet 의 해당 문자열이 새 자리 이름으로 바뀐다.
  `definition` 은 그대로라 `definitionHash` 도 같고, 다시 임베딩할 것은 없다.

## 0.9.0 — 2026-09-27

API 는 바뀌지 않았다. 시각화가 277 개에서 951 개로 늘었고, 그 가운데 **카탈로그에 처음 실리는
분야가 넷** 있다. 호스트가 분야 id 를 옮기는 표를 쓰고 있다면 아래 **호스트가 할 일** 을 먼저 보라.

### 시각화 674 개 추가

없어진 facet 은 없고, 기존 facet 의 id 와 분야도 그대로다.

| 분야 | id | 0.8.0 | 0.9.0 |
| --- | --- | ---: | ---: |
| 컴퓨터 과학 기초 | `cs-fundamentals` | 175 | 175 |
| 프로그래밍 기초 | `programming-fundamentals` | 1 | 48 |
| 컴퓨터 구조 | `computer-architecture` | 28 | 59 |
| 운영체제 | `operating-systems` | 1 | 71 |
| 컴퓨터 네트워크 | `networks` | 1 | 53 |
| 웹 런타임 | `web-runtime` **새로** | 0 | 41 |
| 데이터베이스 | `databases` | 1 | 74 |
| 컴파일러와 언어 | `compilers` | 1 | 52 |
| 개발 도구 | `dev-tooling` **새로** | 0 | 43 |
| 머신러닝 기초 | `ml-foundations` | 34 | 74 |
| 딥러닝 | `deep-learning` **새로** | 0 | 42 |
| AI 엔지니어링 | `ai-engineering` | 21 | 52 |
| 시스템 설계 | `system-design` | 3 | 51 |
| 보안과 암호 | `security` | 10 | 34 |
| 컴퓨터 그래픽스 | `graphics` | 1 | 31 |
| 수학 기초 | `math-foundations` **새로** | 0 | 51 |

- `getFacetCatalog()` 의 `domains[]` 가 12 개에서 16 개로, 하위 분야가 24 개에서 87 개로
  는다. 빠진 분야 · 하위 분야는 없다.
- 개념 메타(`getFacetConcepts()`)도 같은 674 개가 늘어 951 개다.

### 호환되는 변경

- **기존 개념 277 개의 `definition` 은 한 글자도 바뀌지 않았다** — `definitionHash` 가
  그대로라 새로 는 674 개만 임베딩하면 된다.
- 기존 개념 여섯(`conditional-statement` · `context-switching` · `ip-routing` ·
  `relational-tables-and-keys` · `spatial-locality` · `tokenization`)에 새 조각을 잇는
  `contrastWith` 가 붙었다. `ip-routing` 에는 합쳐진 ICMP 토픽의 검색어 두 개가 더해졌고,
  `spatial-locality` · `tokenization` 에서는 다른 개념이 맡게 된 검색어가 빠졌다.
- 코드 패널의 라벨(`codePanel.label`)이 열 언어 객체를 받는다. 전에는 객체를 넘기면
  `[object Object]` 가 떴다.
- `@ffacet/core` 는 코드 변경이 없다.

### 크기

| | 0.8.0 | 0.9.0 |
| --- | ---: | ---: |
| `bootstrap` 첫 번들 (`dist/bootstrap.js`) | 46KB | 153KB |
| 한국어 카탈로그 chunk | 76KB | 290KB |
| `bootstrap` tarball | 4.59MB | 12.4MB |
| `host-tiptap-bundle` tarball | 4.60MB | 12.4MB |
| `authoring` tarball | 1.53MB | 5.33MB |

첫 번들은 facet 마다 한 줄씩인 lazy 로더 표가 951 줄로 늘어서 커졌다. facet 코드는 여전히
chunk 로 갈려 있어 열 때만 내려간다.

### 호스트가 할 일

1. **분야 id 를 옮기는 표에 새 id 넷을 넣는다** — `web-runtime` · `dev-tooling` ·
   `deep-learning` · `math-foundations`. 0.8.0 카탈로그에는 facet 이 없어 실리지 않았던
   분야다. 모르는 분야를 만나면 동기화 전체가 멈추도록 되어 있다면 이것부터 해야 한다.
   `methii-web` 기준으로는
   `apps/temporal-worker/src/scripts/extension-sync/adapters/facet.ts` 의
   `TAXONOMY_BY_DOMAIN` 이다.
2. 개념 메타를 다시 동기화한다. 새 674 개만 임베딩하면 된다.

### 알려진 어긋남

0.8.0 에 적은 두 가지(전제가 데모 글에만 있는 조각, 조각 두 곳에 남은 옛 조작 캡션)는
그대로 남아 있다.

## 0.8.0 — 2026-09-17

호스트가 손봐야 하는 것이 둘 있다. 아래 **호스트가 할 일** 을 먼저 보라.

### 호환이 깨지는 변경

**1. 시각화 목록을 언어별로 불러온다 — `@ffacet/bootstrap` · `@ffacet/host-tiptap-bundle`**

```ts
// 0.7.0
const catalog = getFacetCatalog();            // FacetCatalogEntry[] (동기)

// 0.8.0
const catalog = await getFacetCatalog('ko');  // { locale, domains, facets }
```

- `facets[]` 항목은 `{ id, title, description?, domain, subdomain }` 이고, 글자는 **이미 그
  언어로 골라져 있다**. `LocaleStr` 을 호스트가 다시 해석할 필요가 없다.
- `domains[]` 는 분야 이름표다 — `{ id, name, subdomains: [{ id, name }] }`. 목록의 묶음
  머리를 `ai-engineering` 이 아니라 "AI 엔지니어링" 으로 그릴 수 있다.
- 지원하지 않는 언어를 주면 영어가 오고 `locale` 이 `'en'` 이 된다. 언어를 안 주면 영어다.
- `domains` 와 `facets` 는 분류표 순서(분야 → 하위 분야 → facet)를 따른다. 그대로 순회하면
  된다.
- 새 타입 `FacetCatalog` · `FacetCatalogDomain` · `FacetCatalogSubdomain` 을 함께 내보낸다.

**2. 분야 id 가 바뀐다 — 카탈로그와 `@ffacet/authoring` 양쪽**

facet 의 분야는 이제 저장소의 분류표(`taxonomy/taxonomy.json`)가 원본이다. 디렉터리
이름을 쓰던 값 38 개가 바뀐다.

| 0.7.0 | 0.8.0 | 수 |
| --- | --- | ---: |
| `ml-basics` | `ml-foundations` | 34 |
| `database` | `databases` | 1 |
| `network` | `networks` | 1 |
| `os` | `operating-systems` | 1 |
| `cs-fundamentals` | `system-design` | 1 (`facet:lruCache`) |

`getFacetConcepts()` 의 `domain` 도 같은 값이 된다. 손으로 적던 필드를 없애고
canonicalFacet 으로 분류표에서 찾아 붙이므로, 카탈로그와 개념 메타의 분야가 어긋날 수
없다.

**3. 설명 글 조회 API 를 없앴다 — `@ffacet/core`**

`registerDescription` · `getDescription` 이 사라졌다. facet 마다 `description.ts` 로 들고
있던 학습 설명 마크다운 277 편(752KB)은 이 저장소의 데모 사이트만 쓰는 글이었는데,
facet chunk 에 묶여 발행 번들 두 곳에 실리고 있었다. 글은 데모 사이트로 옮겼다.

### 호환되는 변경

- **개념 메타의 조작 서술을 고쳤다** (`@ffacet/authoring`). 조각 181 전부가
  `briefing.screen.affordances` 에서 "Replay 와 Step 두 단추" 를 말하고 있었다. 한 걸음
  단추는 스크럽 띠로 바뀌어 화면에 없다(0.6.0 부터). 호스트 writer 가 이것을 읽고 없는
  단추를 누르라는 글을 쓸 수 있었다. 다시 보기 단추와 재생 띠로 다시 썼다.
- **화면 글자 목록(`briefing.screen.labels`)에서 화면에 없는 글자를 뺐다.** 생성기가
  control-bar 를 쓰는 facet 에 그 view 가 가질 수 있는 버튼 글자를 통째로 붙이고 있었다 —
  조각에는 "⏭ 한 걸음 · ⏸ 일시정지 · ▶ 재생 · 속도 · 리셋 · 삽입 · 검색" 이, 완제품에는
  쓰지도 않는 "↻ 다시 보기" 가 붙었다. 이제 facet 이 선언한 컨트롤만 푼다. 전에 빠져
  있던 segmented-slider 의 칸 글자(`1-way` · `write-back` 등)가 새로 들어간다.
- `surface.definition` 은 한 글자도 바뀌지 않았다 — **`definitionHash` 가 그대로라
  호스트가 임베딩을 다시 만들 필요가 없다.**
- `@ffacet/core` 는 설명 글 API 제거 외에 코드 변경이 없다.

### 크기

| | 0.7.0 | 0.8.0 |
| --- | ---: | ---: |
| `bootstrap` 첫 번들 (`dist/bootstrap.js`) | 813KB | 46KB |
| `bootstrap` tarball | 5.08MB | 4.59MB |
| `host-tiptap-bundle` tarball | 5.10MB | 4.60MB |

첫 번들이 줄어든 까닭은 카탈로그가 10 개 언어를 한 배열에 담아 entry 에 실려 있었기
때문이다. 이제 언어마다 chunk 가 갈려 요청한 언어 하나만 내려간다(한국어 76KB). 비
ASCII 문자열을 `\uXXXX` 로 풀지 않게 한 것도 함께 줄였다 — 풀면 한국어 카탈로그가
110KB, 힌디어가 195KB 로 부푼다.

### 호스트가 할 일

1. `getFacetCatalog()` 호출을 `await getFacetCatalog(locale)` 로 바꾸고, 반환값에서
   `facets` 를 꺼내 쓴다.
2. **분야 id 를 옮기는 표를 고친다.** 호스트가 FACET 분야를 자기 분류로 옮기고 있고, 모르는
   분야를 만나면 동기화 전체가 멈추도록 되어 있다면, 위 표의 새 id 다섯을 먼저 넣어야
   한다. `methii-web` 기준으로는
   `apps/temporal-worker/src/scripts/extension-sync/adapters/facet.ts` 의
   `TAXONOMY_BY_DOMAIN` 이다.
3. 개념 메타를 다시 동기화한다. 조작 서술과 화면 글자 목록이 바뀌었다. `definitionHash` 는
   그대로이므로 재임베딩은 필요 없다.

### 알려진 어긋남 (다음 릴리스 후보)

- **전제가 데모 글에만 있는 조각 67 개.** 규칙이 "전제를 적을 자리는 `description.ts` 다,
  그 글이 조각과 함께 딸려 온다" 고 적고 있었으나 그 글은 호스트로 가지 않는다. 전제를
  개념 메타에 담아야 하며, 어느 필드에 둘지는 정해지지 않았다.
- **조각 두 곳(`facet:blackHeightEqual` · `facet:rotateToBalance`)의 화면 문안에 옛 조작
  캡션이 남아 있다.** 도달 불능인 손짚기 루프의 되감기 문안이라 화면에는 뜨지 않는다.
  그 루프(조각 178 곳)를 걷어낼 때 함께 사라진다.

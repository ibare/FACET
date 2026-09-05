---
name: C10 화면 문자 리소스
description: 화면에 그리는 문자열은 코드에 하드코딩하지 않는다. facet 고유 문안은 FacetJson.messages, 프레임워크 공통 문구는 메시지 카탈로그. 조회는 언제나 주입된 translator 경유.
type: concern
version: 1
last_verified: 2026-09-05
---

# C10. 화면 문자 리소스

## When to Apply

- `facets/**/projector.ts` / `facets/**/*-stage.ts` 가 화면에 문자열을 그릴 때
- `facets/**/algorithm.ts` 가 캡션·상태 문구를 payload 에 담을 때
- `packages/core/src/views/**` / `packages/view-*/**` 빌트인 view 의 라벨
- `facet.ts` 의 `messages` 작성
- `messages/*.json` 편집, `pnpm messages:gen` 실행

## 왜

`FacetJson` 은 장차 에디터로 불특정 다수가 만드는 선언이다. 시각화가 **무엇이라
말하는지** 도 저작 결정이므로, 문안이 projector / view 코드에 있으면 저작자가
손댈 수 없다. 문자열을 코드 안 카탈로그로 옮기는 것만으로는 부족하다 — 그것도
여전히 코드다. 코드에는 **키만** 남아야 한다.

## 두 층

| 무엇 | 어디에 | 누구 소관 |
|---|---|---|
| facet 고유 문안 — 캡션 · stage 라벨 · 서사 | `facet.ts` 의 `messages` | 저작자 |
| 프레임워크 공통 문구 — 재생 버튼 · 코드 패널 UI | `messages/*.json` + 코드의 en 원본 | 프레임워크 |

프레임워크 문구도 저작자가 덮어쓸 수 있다. 빌트인 view 는 저작자가 에디터에서
가져다 놓는 컴포넌트이므로 캡션을 바꿀 수 있어야 한다 — `FacetJson.messages` 에
그 view 의 키를 그대로 쓰면 된다.

## 조회 순서

```
1. FacetJson.messages[key]     저작자가 정한 문안       ← 언제나 이김
2. locale 번들[key]             registerMessages 로 주입
3. 코드의 en 원본               호출부 fallback
```

셋째가 반드시 있으므로 번역이 하나도 없고 저작자가 아무것도 쓰지 않아도 화면은
en 으로 온전히 동작한다.

2층은 **주입해야 존재한다.** 호스트가 자기 번역 리소스를 `registerMessages` 로
넣거나, 리포의 번들을 쓰려면 `@ffacet/bootstrap` 의 `loadFrameworkMessages(locale)`
를 호출한다. 아무도 부르지 않으면 2층이 비어 프레임워크 문구가 en 으로 뜬다 —
facet 문안은 1층에서 오므로 이때 한 화면에 두 언어가 섞인다.

## MUST

- 화면에 그리는 문자열은 **`tr(key, 'en 원본', vars?)`** 로 조회한다. Projector 는
  `runtime.t`, View 는 `params.t` 를 쓴다. 러너가 `FacetJson.messages` 오버라이드를
  얹은 조회기 하나를 양쪽에 주입하므로, 한 facet 안에서 문안 출처가 갈리지 않는다.
- **en 원본은 호출부에 리터럴로 둔다.** 추출기 (`scripts/gen-messages.mts`) 가
  리터럴만 인식하므로 상수나 변수로 빼면 번역 대상에서 누락된다.
- 값 삽입은 **`{name}` 플레이스홀더 + `vars`** 로 한다. 문자열 이어붙이기나 템플릿
  리터럴 보간을 쓰면 어순이 다른 언어에서 문장이 깨진다.
- facet 고유 키는 네임스페이스 없이 짧게 (`'caption.push'` / `'label.top'`).
  프레임워크 키는 `view.<viewName>.<name>` (`'view.controlBar.play'`).
  세그먼트는 모두 lowerCamelCase.
- `facet.ts` 의 `messages` 는 `Record<string, LocaleStr>` 이며 최소 `en` 을 갖는다.
- 프레임워크 문구를 추가·변경하면 `pnpm messages:gen` 으로 `messages/en.json` 을
  갱신한다. 추출기가 기존 번들과 대조해 고아 키와 미번역 키를 보고한다.

## MUST NOT

- projector / view 코드에 화면 문자열을 리터럴로 박지 않는다 (`setCaption('꼭대기에 …')`).
- View 가 스스로 `makeTranslator(params.locale)` 를 부르지 않는다 — 저작자
  오버라이드를 보지 못한다. 러너 밖 mount 를 위한 fallback 은
  `params.t ?? makeTranslator(params.locale)` 형태로만 허용한다.
- 조회 함수를 모듈 스코프에서 만들지 않는다. `tr` 은 mount / 팩토리 안에서만
  존재하므로, 모듈 최상단 상수·배열·함수가 문안을 담으면 조회할 수 없다. 그런
  경우 mount 내부 지역 선언으로 옮기거나 translator 를 인자로 받게 한다.
- `messages/*.json` 에 facet 고유 키를 넣지 않는다. 그쪽은 프레임워크 공통 문구
  전용이며, 추출기의 스캔 범위도 `packages/` 로 한정되어 있다.
- **`algorithm.ts` 가 화면 문안을 payload 로 보내지 않는다.** algorithm 은 translator 를
  갖지 않고, 문안을 정하는 것은 표현 계층의 일이다 (원칙 1). 캡션을 띄워야 하면
  **키를 emit** 하고 (`payload: { textKey: 'caption.noRoute' }`) projector 가 `tr` 로
  해석한다.

## PREFER

- 한 문안이 여러 곳에서 쓰이면 팩토리 / mount 안에 헬퍼 함수를 두어 en 원본
  리터럴이 한 번만 나오게 한다 (`const baseCaption = () => tr('caption.base', '…')`).
- en 원본에 apostrophe 가 있으면 큰따옴표로 감싼다. 추출기는 두 따옴표를 모두
  받지만 백틱은 받지 않는다.
### 표식이냐 문안이냐

번역하면 오히려 화면과 어긋나는 것들이 있다. 다음 순서로 판정한다.

1. **도형에 새겨진 글자인가** — 캡의 `IN` / `OUT`, LED 의 `PUSH` / `POP` / `OVERFLOW`
   처럼 그래픽의 일부로 각인된 것. **표식** → 상수로 두고 키를 만들지 않는다.
2. **그 분야에서 원어 그대로 통용되는 용어인가** — `head` / `tail` / `NULL` /
   `prefix` / `next-hop` / `iface` / `broker` / `alt`. 한국어 문서도 영어로 쓰는
   말이다. **표식** → 상수.
3. **수식·기호 표기인가** — `RSS = —`, `det = +1.00`, `h(k) = k mod ?`, `α`.
   **표식** → 상수. 단위나 라벨이 붙어 문장이 되면 4번으로.
4. 그 외 — 조사·어미가 붙거나 어순이 언어마다 달라지는 것. **문안** → 키.

경계 판정: **소문자 도식 라벨 한 단어는 표식, 문장·명령형·값이 끼어드는 조립문은
문안.** `capacity` 는 표식이지만 `Size: {n} / {cap}` 은 문안이다. 표식이라도 그것을
포함한 완성 문장이 필요해지면 문장 전체를 키로 만든다 (표식 단어는 en 원본 안에
그대로 남는다).

## Exception

- `description.ts` 의 학습 설명 마크다운은 이 규칙의 대상이 아니다. 화면 위젯이
  아니라 호스트가 렌더하는 문서이며, 별도 경로로 다국어를 다룬다.
- 테스트 코드의 문자열 리터럴은 대상이 아니다.

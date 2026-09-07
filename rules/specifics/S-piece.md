---
name: S-piece
description: 조각(piece) facet 의 규범 — 한 주장 · 필수 조작 없음 · reactive · 전제 각주 · 캔버스 폭 620. 완결형 facet 과 같은 6파일 구성을 쓰되 성격이 다른 종류다.
type: specific
version: 1
last_verified: 2026-09-07
---

# S-piece. 조각(piece) facet

## 조각이란

**한 주장을 말하고 끝나는 작은 facet.** 글의 한 문단 옆에 놓여, 그 문단이 하는
주장 하나를 그림으로 뒷받침한다.

완결형 facet 과 크기가 아니라 **종류**가 다르다. 완결형은 한 개념을 처음부터
끝까지 보여 주고 학습자가 조작하며 탐색하는 물건이고, 조각은 한 문장을 말하고
멈추는 물건이다. 그래서 아래 규범이 완결형과 여러 곳에서 어긋난다.

## 적용 범위

`facets/**/<name>/src/**/*.ts` 중 조각으로 선언된 facet. 파일 구성은 **S-facet 을
그대로 따른다** (6파일 + 선택적 stage view 1개). 이 문서는 그 위에 얹히는
추가 규범이다.

현재 조각 (9종, 전부 `facets/security/`):
`hashFixedLength` / `hashAvalanche` / `pigeonholeCollision` / `hashIntegrityCheck` /
`hashSalt` / `hashChain` / `merkleTree` / `signatureKeyDirection` / `signatureOnHash`

## 조각을 만들기 전에 — 맥락에서 명세를 뽑는다

조각은 자료구조나 개념을 쪼개서 얻는 것이 아니다. **학습 맥락에서 도출한다.**

1. 한 덩어리(해시, 서명 등)를 놓고 그것을 설명할 때 글이 멈추는 지점을 나열한다.
2. 각 지점에 **"그림 없이 그 문장을 이해시킬 수 있는가"** 를 묻는다.
   - 문장으로 충분하면 조각을 만들지 않는다
   - 그림이 훨씬 빠르면 값어치 있다
   - 그림 없이는 사실상 불가능하면 필수다
3. 남은 것마다 **답하는 질문 한 문장**을 쓴다. 그 문장이 곧 명세이자
   `surface.definition` 이자 검수 기준이다.

큰 facet 을 축소해서 조각을 만들려는 시도는 실패한다 (11378b1 / 60226b7). 같은
algorithm·projector·view 에 작은 입력을 넣으면 축척·라벨·움직임이 부모 그대로라,
한 대목을 확대한 그림이 아니라 부모의 축소판이 된다.

## MUST

- **한 주장만 말한다.** 캡션이 둘이면 조각이 둘이라는 신호다. 진행 중 캡션이
  여럿인 것은 한 논증의 단계일 때만 허용된다 (문제 → 장치 → 결과).
- **`mechanismKind: 'reactive'` 를 쓴다.** 조각은 컨트롤바 없이 두 가지를
  해야 하는데 둘 다 reactive 만 준다 — mount 시 스스로 시작하는 것
  (`ReactiveMechanism.init` 의 `ensureStarted`) 과 걸음 간격을 스스로 정하는 것
  (`ctx.sleep`). coroutine 은 `BASE_DELAY_MS` 100ms 로만 나아가고 속도 조정이
  `speed-slider` 로만 가능해 (S-runtime) 조각에 맞지 않는다.
- **걸음 간격은 `initialData.stepMs` 로 선언한다.** 읽을 시간을 주는 것은 저작
  결정이다 (원칙 2).
- **control-bar 에는 다시 보기 하나만 둔다.** `{ widget: 'button', action: 'reset' }`
  이고 라벨만 "다시 보기" 다 — `ReactiveMechanism.reset()` 이 끝에
  `ensureStarted()` 를 부르므로 reset 이 곧 재생이다.
- **`header` (title-block) 를 두지 않는다.** 제목은 글의 문단이 준다.
- **`metrics` 를 두지 않고 `ctx.metric` 을 부르지 않는다.** 조각은 셀 것이 없다.
- **캔버스 폭은 620.** playground 컨테이너가 아니라 글의 문단 폭(600~800px)에
  맞춘다. viewBox SVG 는 늘리면 글자까지 비례해 커지므로 `maxWidth` 로 상한을 둔다.
  세로는 내용이 정한다.
- **화면에 쓰는 값은 실측한다.** 해시·크기·바이트 수를 지어내지 않는다. 앞머리만
  실측하고 뒤를 채우는 것도 금지다 — 화면에 안 보여도 선언은 사실이어야 한다.
- **전제를 각주로 밝힌다.** 축척을 줄였거나, 배치를 손봤거나, 최선의 경우를
  보이고 있다면 화면이 그 사실을 말한다. 조각은 한 장면이라 전제를 감추기 쉽고,
  감추면 화면이 거짓을 말하게 된다.
  - 예: "여기서는 자리를 16개로 줄였다. SHA-256 은 2^256 개다"
  - 예: "이 배치는 가장 운 좋은 경우다. 실제로는 여섯 번째쯤에서 이미 겹친다"
- **걸음 순서가 논증이 되게 짠다.** 원인보다 결과를 먼저 보이면 논증이 설명으로
  주저앉는다. 문제를 세운 뒤 장치를 넣고, 성한 것을 보인 뒤 손대고, 전제를 깐 뒤
  결론을 낸다.

## MUST NOT

- **조각을 다른 facet 의 하위로 선언하지 않는다.** 독립 facet 이며
  `canonicalFacet` 은 자기 자신이다. `aspects` 를 쓰지 않는다.
- **id 에 계층을 넣지 않는다.** `facet:hashAvalanche` 처럼 lowerCamelCase 단일
  세그먼트다 (C4). 조각이 독립이므로 부모-자식 id 가 필요 없다.
- **다른 조각의 코드를 import 하지 않는다** (S-facet 과 동일). 겹쳐 보이는 시각
  요소가 있어도 공유하지 않는다 — 아래 PREFER 참조.
- **누르지 않으면 완성되지 않는 화면을 만들지 않는다.** 다시 보기는 놓친 사람을
  위한 것이지 진행에 필요한 조작이 아니다.

## PREFER

- **부품이 아니라 어휘를 공유한다.** 조각 아홉은 시각 부품을 하나도 공유하지
  않는다 (`el()` 헬퍼와 design-tokens 를 빼면). 그것이 조각이 각자 다른 그림을
  요구한다는 증거이고, 공유 view 를 미리 만들지 않은 근거다.

  대신 **같은 것은 같게 그린다.** 공개키는 자물쇠, 개인키는 열쇠 — RSA facet 과
  `signatureKeyDirection` 이 코드를 공유하지 않으면서 어휘를 맞춘 것이 그 예다.
  어휘가 어긋나면 두 화면을 이어 읽는 학습자가 다른 것으로 읽는다.

  실제로 공유할 view 는 **두 번째 사례가 나온 뒤에** 만든다 (S-facet 의 "새 View 는
  둘 이상의 facet 이 공유할 수 있을 때만" 과 같은 원칙). `core/views` 의
  `linked-list-chain` · `ordered-list` · `iso-bar` 가 쓰임 없이 만들어져 아무도
  쓰지 않는 상태로 남아 있다.
- **`contrastWith` 로 조각을 엮는다.** 조각끼리의 관계는 코드가 아니라 authoring
  개념 층에서 자란다. 특히 조각은 서로 가까워서 `avoidWhen` 이 큰 facet 때보다
  중요해진다 — "언제 쓰면 안 되는가" 가 이웃 조각과의 경계를 긋는다.
- **출처와 소속을 구분한다.** 조각은 여러 주제의 글에 등장하므로 소속이 N개지만,
  그것을 만들게 한 그룹은 하나다. 디렉터리와 playground 배치는 **출처**를 뜻하며
  소속을 뜻하지 않는다. `signatureOnHash` 는 해시를 재료로 쓰지만 서명을
  설명하려다 나왔으므로 서명 아래 있다.
- **`title` / `description` / `messages` 는 en·ko 로 시작해도 된다.** 조각 방식이
  자리 잡는 동안의 유예이며, 채택이 굳으면 10개 언어로 맞춘다. `LocaleStr` 이
  `Partial<Record<string,string>>` 이라 타입은 통과하고 미지원 locale 은 en 으로
  떨어진다.

## Exception

- 조각도 `facets/**` 이므로 S-facet · C1~C10 의 대상이다. 이 문서가 완화하는 것은
  **완결형을 전제로 쓰인 조항의 적용 방식**뿐이다.
  - C5 (메트릭 선언) — 조각은 `ctx.metric` 을 부르지 않으므로 애초에 대상이 아니다.
    metrics 패널을 두지 않는 것이 규범이지 선언을 빠뜨리는 것이 아니다.
  - S-facet 의 stage view 1개 제한 — 조각은 한 주장이라 stage 도 하나면 족하다.
    제한에 걸린 사례가 아직 없다.

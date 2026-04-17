# FACET

**Framework for Abstraction and Concept Exploration through Translation.**

소프트웨어 개념을 코드가 아닌 개념 자체로부터 학습할 수 있게 하는 인터랙티브 학습 플랫폼. 코드는 개념의 부산물이며, 같은 개념이 여러 시각화·여러 패러다임·여러 언어로 동시에 투영된다.

## 핵심 가설

기존 프로그래밍 교육은 전부 코드를 1급 시민으로 두고 시각화를 보조로 둔다. FACET은 그 관계를 뒤집는다. **개념이 1급, 코드는 그 개념의 한 표현일 뿐**이다. 학습자는 "반복"이라는 개념을 회로 시뮬레이션으로 먼저 체감하고, 같은 개념이 Python의 `for`로도, JavaScript의 `forEach`로도, Rust의 `iter`로도, 명령형으로도 함수형으로도 표현된다는 것을 동시에 본다.

## DSL

마크다운 안에 인라인 코드 또는 코드펜스로 임베드되는 극도로 얇은 표기.

```markdown
{facet:loop facet:bubbleSort}
```

DSL은 **두 식별자의 인접**일 뿐이다. 컨테이너(`facet:loop`)와 본체(`facet:bubbleSort`). 알고리즘의 데이터, 파라미터, 시각화 종류, IR 패러다임, 출력 언어 — 어느 것도 DSL에 적히지 않는다. 모든 구체는 카탈로그 안에 산다.

## 호스트와 런타임

DSL이 마크다운 안에 사는 표기이므로 **호스트는 무엇이든 될 수 있다**. Tiptap, ProseMirror, Notion 임베드, 정적 마크다운 렌더러, 슬라이드 도구, 학습 플랫폼. 호스트마다 마크다운을 처리하는 방식이 달라서, FACET은 **호스트별 플러그인 형태로 런타임을 붙일 수 있어야** 한다.

핵심 런타임 코어는 호스트 독립적이다. 호스트 어댑터(플러그인)가 (1) 호스트의 마크다운에서 FACET DSL을 발견하고 (2) 그 자리에 FACET 런타임이 그린 인터랙티브 영역을 삽입한다.

**첫 번째 호스트 어댑터는 Tiptap 플러그인**으로 제공된다.

## 문서

- [`docs/01-architecture.md`](docs/01-architecture.md) — 4계층 카탈로그, 컨테이너↔본체 프로토콜, IR과 변환기, phase 동기화
- [`docs/02-dsl.md`](docs/02-dsl.md) — DSL 문법, 마크다운 임베드 규칙, 파서 명세
- [`docs/03-catalog.md`](docs/03-catalog.md) — 카탈로그 항목 스키마, 메타데이터 매칭 규칙
- [`docs/04-runtime.md`](docs/04-runtime.md) — 런타임 아키텍처, 이벤트 모델, 렌즈 동기화
- [`docs/05-host-plugin.md`](docs/05-host-plugin.md) — 호스트 어댑터 인터페이스, Tiptap 플러그인 구현 가이드
- [`docs/06-first-plugin-loop-bubblesort.md`](docs/06-first-plugin-loop-bubblesort.md) — 첫 구현 사례, v7 데모의 모든 결정과 코드

## 현재 상태

- 아키텍처 v7까지 합의 완료, 동작하는 데모 검증 완료
- 첫 본격 구현 시작 단계
- 첫 카탈로그 항목: `facet:loop` 컨테이너 + `facet:bubbleSort` 본체 + 두 IR + 네 변환기
- 첫 호스트 어댑터: Tiptap 플러그인

## 설계 원칙

1. **DSL은 끝까지 가볍다.** 두 식별자 + 인접. 그 이상은 카탈로그.
2. **본체는 IR을 모른다, IR은 본체를 모른다, 둘은 phase 어휘로만 통신한다.**
3. **컨테이너는 본체를 모른다, 본체는 컨테이너를 모른다, 둘은 tick/complete 두 신호로만 통신한다.**
4. **UI 가능성은 카탈로그 메타데이터의 자동 매칭에서 도출된다.** 패러다임 토글, 언어 탭, 본체 변종 — 전부 카탈로그가 결정.
5. **호스트는 무엇이든 될 수 있다.** 코어는 호스트 독립, 어댑터가 다리.
6. **완성은 없다.** 매 결정은 다음 사례에서 다시 깎일 수 있다.

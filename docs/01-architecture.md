# 01. Architecture

FACET은 네 개의 분리된 계층과 그들 사이의 최소 프로토콜로 구성된다. 모든 것이 서로 모르는 상태로 협력하며, 결합은 카탈로그 메타데이터의 매칭으로만 일어난다.

## 4계층 카탈로그

```
catalog = {
  containers:  [ loop, recurse, branch, ... ],
  algorithms:  [ bubbleSort, quickSort, fibonacci, ... ],
  bodies:      [ bubbleSort-bars, bubbleSort-grid, quickSort-tree, ... ],
  irs:         [ bubbleSort-imperative, bubbleSort-functional, ... ],
  transpilers: [ python-imperative, javascript-functional, rust-imperative, ... ]
}
```

### Containers

tick 시그널을 발생시키는 부품. 본체에게 "한 단계 진행해" 신호를 보낸다. 본체가 무엇을 하는지 모른다.

예: `loop`, `recurse`, `branch`, `parallel`, `pipeline`.

### Algorithms

알고리즘은 **데이터 항목**이다. 자체 동작은 없다. 다음을 보유:

- `id`: 알고리즘 식별자
- `phases`: 본체와 IR이 공유할 phase 어휘 (예: `['comparing', 'swapping', 'pass_complete']`)
- 메타데이터(설명, 시간복잡도 등)

알고리즘은 **공통 어휘 사전**이다. 본체와 IR이 같은 어휘를 쓰도록 보장한다.

### Bodies

알고리즘의 시각화 구현. 한 알고리즘이 여러 본체를 가질 수 있다 (`bubbleSort-bars`, `bubbleSort-grid`).

본체는:
- 자기 알고리즘 상태(배열, 포인터, 메트릭 등)를 자체 보유
- 자기 시각화(그림 + 컨트롤 + 메트릭 표시)를 자체 그림
- 자기가 등록할 수 있는 IR 식별자 목록을 보유 (`available_irs`)
- 한 단계 진행 시 phase를 emit
- 종료 결정 시 컨테이너에 `complete` 신호 전송

본체는 IR의 내용도, 코드 표면도, 변환기도 모른다. 자기 phase 어휘만 안다.

### IRs

알고리즘의 코드 표현용 중간 표현. 한 알고리즘이 여러 IR을 가질 수 있다 (명령형 IR, 함수형 IR).

IR은:
- 자기 알고리즘 식별자 보유 (`algorithm: 'bubbleSort'`)
- 자기 패러다임 식별자 보유 (`paradigm: 'imperative'`)
- 변환기가 코드로 펼칠 트리 구조 보유
- 각 노드에 phase 태그 부착 (선택적, source_map용)

### Transpilers

IR → 특정 언어 코드. IR을 받아 자기 언어 문법으로 펼친다.

변환기는:
- 받을 수 있는 패러다임 식별자 보유 (`paradigm: 'imperative'`)
- 출력 언어 식별자 보유 (`target: 'python'`)
- IR을 코드 문자열로 변환하는 로직 보유
- 출력에 source_map(라인별 phase 태그) 부착

UI는 변환기를 학습자에게 직접 노출하지 않는다. 학습자에게는 패러다임 × 언어 매트릭스만 보인다.

## 프로토콜 1: 컨테이너 ↔ 본체

두 신호로만 통신한다.

```
Container → Body:  tick
Body → Container:  complete (선택적)
```

**tick**: 컨테이너가 본체를 깨운다. 본체는 자기 알고리즘을 한 단계 진전시킨다.

**complete**: 본체가 자기 종료를 알린다. 컨테이너가 더 이상 tick을 보내지 않는다.

종료 우선순위:
- 컨테이너가 자체 종료 조건(예: `times: N`)을 가질 수 있고, 본체가 `complete`를 보낼 수도 있다
- **먼저 발생하는 종료 조건이 이긴다**

본체는 컨테이너가 무엇인지 모른다. 컨테이너는 본체가 무엇인지 모른다.

## 프로토콜 2: 본체 → 외부 (phase 이벤트)

본체가 한 단계 진전할 때마다 자기 phase를 외부에 알린다.

```
Body emits: phase: <phase_id>
```

phase 식별자는 알고리즘 카탈로그의 `phases` 사전에서 가져온다. 본체는 phase 이름만 알고, IR 노드 ID나 코드 라인 번호는 모른다.

phase 이벤트의 구독자:
- 본체 자신의 시각화 (자기 그림 갱신)
- 코드 렌즈 (해당 phase 태그가 있는 코드 라인 하이라이트)
- IR 렌즈 (있다면, 해당 phase 노드 하이라이트)
- 그 외 임의의 렌즈

본체는 누가 구독하는지 모른다. 그저 phase를 emit한다.

한 tick 안에서 여러 phase가 순차로 emit될 수 있다 (예: `comparing` → `swapping`). 본체가 자기 미세 phase 머신을 가진다.

## 카탈로그 메타데이터 매칭으로 UI 자동 도출

학습자가 보는 UI는 카탈로그 항목들의 메타데이터 매칭에서 자동 생성된다.

예: `{facet:loop facet:bubbleSort}` 시:

1. DSL 파서: 두 식별자 추출 → `loop` (컨테이너), `bubbleSort` (본체)
2. 본체 카탈로그: 어떤 본체로 렌더할지 결정 (디폴트 본체 또는 사용자 설정). 예: `bubbleSort-bars`
3. 본체의 `available_irs` 조회 → `['bubbleSort-imperative', 'bubbleSort-functional']`
4. IR들의 `paradigm` 조회 → `imperative`, `functional` → 패러다임 토글 자동 생성
5. 변환기 카탈로그에서 `paradigm` 매칭 → 호환 변환기들의 `target` 수집 → 언어 탭 자동 생성
6. 알고리즘의 `phases` 조회 → 색상 팔레트 자동 할당, 모든 렌즈가 같은 phase 어휘 공유

**누구도 "이 UI는 이렇게 만들어"라고 명시하지 않는다.** UI는 카탈로그 데이터의 결과물이다.

## 합성 (미래)

DSL 결합이 단순 인접이므로, 같은 식별자의 자기 결합도 자연스럽게 표현 가능:

```
{facet:loop facet:loop}        — 중첩 반복
{facet:loop facet:bubbleSort facet:tally}  — 본체에 부속 본체
```

합성 규칙은 v1에서는 미정. 첫 단계에서는 단순 (컨테이너 + 본체) 한 쌍만 지원. 합성 도입 시 phase 어휘 충돌 방지, 시각화 합성 규칙, 변환기 합성 규칙 등의 추가 결정 필요.

## 구현 우선순위

v1 (현재):
- 단일 컨테이너 (`loop`)
- 단일 알고리즘 (`bubbleSort`) + 한 본체 (`bubbleSort-bars`) + 두 IR + 네 변환기
- DSL 파서 (단일 (컨테이너, 본체) 쌍만)
- 회로 시각화 + phase 동기화 코드 렌즈

v2:
- 두 번째 본체 변종 (`bubbleSort-grid` 또는 `bubbleSort-circles`) — 같은 알고리즘 다른 시각
- 두 번째 알고리즘 (`linearSearch` 또는 `accumulate`) — 다른 phase 어휘 검증

v3:
- 두 번째 컨테이너 (`recurse` 또는 `branch`)
- 합성 규칙 도입

각 단계마다 v7 합의가 어떤 부분에서 깎이는지 관찰. 문서는 그때마다 갱신.

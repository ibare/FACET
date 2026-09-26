# 웹 런타임 완제품 여덟 — 배치 기록

2026-09-26. 조각 서른셋(`web-runtime-piece-batch.md`)이 닫힌 뒤 origin 토픽 열여덟을 판정했다. 같은
세션에서 개념 메타까지 닫았다.

## 판정 — 열여덟에서 여덟(합침 다섯 · 버림 넷 · 단독 셋)

잣대 셋(IR · 조작 · 통합, `whole-batch-protocol.md`)을 `judge-sim.py`(11개 토픽 실측 시뮬레이션, 표준
라이브러리만)로 실측해 판정했다.

| 판정 | 완제품 | 흡수/host 토픽 |
| --- | --- | --- |
| 단독 | cascade-priority | style-calculation |
| 단독 | layout-thrash | layout-reflow |
| 단독 | repaint-cost | paint-and-composite |
| 합침 | keyed-reconciliation | keys-in-lists ← virtual-dom-diff |
| 합침 | reactive-updates | dependency-tracking ← update-batching |
| 합침 | cooperative-yielding | blocking-and-yield ← microtask-queue 절반(starvation) |
| 합침 | frame-budget | composited-animation ← frame-deadline 절반(sixteen-ms·dropped-frame) |
| 합침 | critical-path | critical-rendering-path ← script-blocking · resource-priority |

**버림 넷**: `call-stack`(frames-stack-up — 조작 약: 깊이 손잡이가 곧게 비례할 뿐 새 말이 없다) ·
`task-queue`(one-turn-at-a-time·timer-is-a-floor — 통합 약: timer-is-a-floor 는 조작이 살지만 둘을 한 화면에
놓을 자리가 없다, timer 쪽 주장은 cooperative-yielding 이 이미 더 풍부히 함) · `dom-and-cssom`(two-trees-meet
— 조작 약: `display:none` 위치 선택 자체가 답이라 손잡이가 논증을 못 짐) · `animation-frame-callback`
(just-before-paint — 조작 약: 박자당 메시지 수를 늘려도 draw 호출은 박자 수에 고정).

**부분 흡수의 잔여**: `microtask-cuts-in`(microtask-queue) · `jank-vs-slow`(frame-deadline) 는 같은
origin 토픽의 형제가 완제품에 흡수된 뒤에도 그 자신은 손잡이로 못 잇는다고 판단해 조각으로만 남겼다 —
그래서 두 토픽 컨테이너는 삭제하지 않고 그대로 뒀다(한 토픽 아래 완제품과 조각이 공존하는 모양은 없다 —
흡수된 조각만 origin 을 옮기고, 남은 조각은 원래 컨테이너를 그대로 가리킨다).

## 카탈로그 정리 (커밋 `85c344cf`)

버린 넷은 항목째 삭제. 합친 다섯은 host 토픽 이름을 합친 내용에 맞게 개명 — `blocking-and-yield`→"협조적
양보", `keys-in-lists`→"키 있는 재조정", `dependency-tracking`→"반응형 갱신", `composited-animation`→
"프레임 예산과 합성", `critical-rendering-path`→"크리티컬 렌더링 패스와 로딩 순서". 흡수된 조각의 `origin`
을 host 토픽으로 옮겼다. `test/catalog-integrity.test.ts` 규모 하한 1044 → 1036(사유는 검사 파일 주석).

## 사양 — 넷으로 나눠 병행

`judge.md` 의 "사양 에이전트 나누기 안" 그대로: A(렌더링 파이프라인, native — cascade-priority·layout-thrash·
repaint-cost) · B(재조정/반응성, pseudo-notation — keyed-reconciliation·reactive-updates) · C(이벤트
루프/프레임, native — cooperative-yielding·frame-budget) · D(로딩, native, 조각 여섯을 흡수하는 가장 큰
완제품이라 혼자 한 배치 — critical-path).

## 흐름

```
판정 에이전트 하나 (10.7 분 · 0.23M) → judge.md + judge-sim.py
사양 에이전트 넷 병행 (10.4 ~ 25.4 분)
whole-builder 여덟 동시 (22.0 ~ 37.1 분, 평균 27.9)
감사는 배치 끝에 일괄 (동시 실행 중엔 남의 미완성 패키지를 물어 결과가 흔들리므로)
```

## 호스트 도구에서 발견·수정한 결함

**`packages/view-code`(code-view) 의 `label` 이 열 언어 객체를 못 받는다.** `whole-contract.md` 는
`codePanel: { label: <열 언어> }` 라고 적어 두는데, 실제 타입은 `label?: string` 고정이고 `textContent =
cfg.label ?? ''` 이 그 값을 그대로 대입한다 — 객체를 넣으면 JS 가 `"[object Object]"` 로 강제 변환한다.
`layout-thrash` 를 만든 에이전트가 자체 검증 중 발견했고(그 완제품은 `label` 자체를 생략해 피함), 감사해
보니 나머지 일곱 중 여섯이 이미 열 언어 객체를 `label` 에 넣어 둔 채였다. `resolveLocale` 을 거치도록
고쳤다(같은 파일의 다른 라벨이 이미 쓰던 패턴, 커밋 `ee329b4c`). 여덟 전부 재검증 통과.

## 감사가 잡은 것

**위반 없음.** 세 자리를 특히 확인했다 — 전부 정당함으로 판정:

- `repaint-cost` 의 `ctx.metric` 셋을 "누적"이 아니라 "지금 판의 값"으로 diff 전송 — `whole-batch-protocol.md`
  가 정확히 이 패턴을 처방한다(2026-09-12 넷이 같은 자리서 부딪힌 사례로 이미 문서화됨).
- `keyed-reconciliation` 의 `move` phase 를 "실제 이동" 이 아니라 "이동 여부를 판단하는 코드 줄" 에 붙임 —
  2축 손잡이 교차점에서만 실제 발생하는 phase 를 `whole-self-check` 의 단일축 스윕이 방문하지 못하는
  **구조적 한계**를 정당하게 우회한 것.
- `frame-budget`·`keyed-reconciliation`·`reactive-updates`(+ 정규식 사각지대로 감사가 뒤늦게 찾은
  `cooperative-yielding`)의 `initialData.type` camelCase — 사양이 그렇게 지시했고 `S-facet` 에 표기 조항이
  없어 위반 아님. `whole-check.mjs` 의 관례 검사 정규식이 `initialData` 를 별도 `const` 로 선언해
  스프레드하는 구조를 못 잡는 사각지대도 함께 발견(도구 결함, 규칙 위반 아님).

## 계기

```
whole-check   여덟 모두 오류 0 (경고 3 — 전부 initialData.type 관례, 사양이 명시)
관성          평균 0.09 · 최고 0.16 · 좌표 0.31 · 어휘 6종 · 운동 8/8   PASS
전수          typecheck PASS · test 2423/2423 (조각+완제품 합산 후)
scene-audit   완제품엔 적용 안 됨 — isPiece 필터로 조각 전용(확인 완료, 처음엔 모르고 돌렸다가 발견)
```

## 개념 메타

묶음 아홉(단일/합침 완제품마다 하나 + 완제품 없는 조각 여섯을 origin 토픽별로 한 묶음)마다 에이전트
하나가 **완제품과 조각을 함께** 썼다 — 마흔하나(조각 서른셋 + 완제품 여덟) 전부 새로 씀, 이 도메인
자체가 새 도메인이라 대비 잇기(`contrastWith`)는 기존 74 개 중 인접 개념이 없어 대부분 묶음 안에서만
닫혔다(`read-is-subscribe`→`messagingPubsub`, `two-trees-meet`→`cascadePriority` 등 예외 있음).
`concept:audit` 기계 판정 통과(어휘 후보 22건은 정보성, contrastWith 미선언 참조 0). `concept-covers-facets`
4/4 통과.

## 커밋

- `85c344cf` chore(catalog): 웹 런타임 완제품 판정에 따라 토픽 아홉 정리
- `ee329b4c` fix(view-code): 코드 패널 라벨이 열 언어 객체를 못 받는다
- `64fe7d04` feat(facets): 웹 런타임 완제품 여덟
- `2a2fee23` feat(authoring): 웹 런타임 개념 메타 마흔하나

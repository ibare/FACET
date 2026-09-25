# 프로그래밍 기초 조각 서른둘 · 개념 서른둘 — 배치 기록

2026-09-25. 프로그래밍 기초 분야에서 제어 흐름을 뺀 서브도메인 다섯(변수와 타입 · 함수 · 객체 지향 · 함수형 · 메모리 모델)의
미구현 조각 전부. 규범은 `piece-batch-protocol.md` · `concept-meta-batch-protocol.md` · `pseudo-notation.md`. 사용자 지정으로
**칸 열**, 에이전트를 직접 띄웠다(Workflow 아님). 완제품은 범위 밖이다. 제어 흐름 배치(`control-flow-piece-batch.md`)와 같은 세션에서
대화 요약 뒤 이어 돌렸다 — "분야마다 새 세션" 조항과 다르다(아래 실측).

## 만든 것

| 서브도메인 | 조각 (걸음) |
| --- | --- |
| 변수와 타입 | value-in-place (6) · reference-holds-address (4) · aliasing (5) · narrowing-loss (7) · shadowing (7) · scope-exit (8) · dangling-reference (9) |
| 함수 | pass-by-value-vs-reference (11) · return-to-caller (9) · closure-captures (14) · function-as-value (11) · currying-partial (6) |
| 객체 지향 | instantiate-from-class (9) · method-lookup-up (12) · dynamic-dispatch (11) · interface-slot (7) · encapsulation-boundary (9) |
| 함수형 | pure-same-output (10) · no-side-effect (7) · immutable-copy (8) · map-one-by-one (7) · filter-keep-some (9) · reduce-fold (7) · monad-chain-in-box (7) |
| 메모리 모델 | stack-vs-heap (12) · pointer-dereference (9) · gc-reachable-from-root (12) · refcount-zero (8) · reference-cycle (7) · manual-free (7) · double-free (9) · memory-leak (16) |

gc-reachable-from-root 하나만 코드가 없다(한 순간의 객체 그래프). 나머지 서른하나는 짧은 프로그램을 알고리즘 속 작은 해석기가 밟는다.
표기는 모두 `pseudo-notation.md` — 이 배치가 처음부터 그 규약으로 쓴 첫 배치다.

## 흐름

```
사양 다섯 (서브도메인마다 하나, 동시에)       6.4 ~ 8.3 분 · 각 0.11 ~ 0.12M
사양 셋 도착 즉시 조각 열을 칸에 · 나머지 둘은 대기열 뒤에
조각 서른둘 흘려보내기 (칸 10)                 하나 5.3 ~ 11.7 분
감사는 끝나는 대로 하나~둘씩 (칸 밖)           한 번 1 ~ 2 분 · 평균 0.53M
서브도메인이 닫히는 대로 등록 · 관성 · 개념 메타 (개념 에이전트 하나가 서브도메인 하나)
마지막: scene-audit 서른둘 · typecheck · test
```

사양 초안을 띄운 뒤 서른둘이 모두 닫히기까지 **약 42 분**. 칸이 빈 적은 없다 — 대기열이 마지막 조각을 넣은 뒤로만 줄었다.

## 실측

| | 제어 흐름 (칸 5, 같은 날 아침) | **이번 (칸 10)** |
| --- | --- | --- |
| 조각 하나 (감사 고침 포함) | 2.92M · 12.1 분 | 약 3.8M (piece-builder 합 122M ÷ 32) · 만들기 5 ~ 12 분 |
| rule-guard 한 번 | 0.43M · 1.2 분 | 0.53M · 1.3 분 (30 번) |
| 사양 초안 (서브도메인 하나) | 7.5 분 · 0.78M | 7.1 분 · 1.2M |
| 개념 메타 (서브도메인 하나) | — | 3.0M · 4 ~ 7 분 |
| 호스트 | 턴당 385K | 턴당 288K (415 턴 · 119.5M, 끝 컨텍스트 433K) |

- 조각이 **제어 흐름보다 무겁다**(3.8M). 해석기를 짜는 소재가 그대로고, 감사 고침이 더 많았다 — 서른둘 중 스물이 고침을 받았다.
- 호스트는 턴당 288K 로 줄었지만 **알림 한 번에 한 턴**이라 조각 수가 늘면 선형으로 는다. 칸 10 에서 알림이 잦아 415 턴.
  대화 요약 뒤 시작했는데도 끝에는 433K 였다 — 새 세션 조항의 근거가 이번에도 선다.

## 감사가 잡은 것 — 검사기가 전부 초록인 채로

| 꼴 | 조각 | 이제 |
| --- | --- | --- |
| **해석기가 조용히 지나친다** (C6) — 모르는 문을 `else` 로 몲 · `continue`/`return` · `?? 0`/`''` 로 값 지어냄 · 줄 번호 없는 오류 · `args[0]!` | pointer-dereference · encapsulation-boundary · stack-vs-heap · dynamic-dispatch · manual-free · reference-cycle · double-free · memory-leak | 계약 카드 한 줄 · rule-guard 표 한 줄 |
| **캡션에 셈하지 않은 결론** ("~는 그대로다" · "같은 몸이 돈다" · "값 그대로") | pass-by-value · return-to-caller · function-as-value · no-side-effect · filter-keep-some · stack-vs-heap | rule-guard 표 한 줄 (공통 안내문에는 앞부터 있었다) |
| 걸음 0 이 빈 장면 + silent 아닌 `init` → 걸음이 하나 늚 | closure-captures · dangling-reference (reduce-fold 는 지적됐으나 받아들임) | 계약 카드 scene 절이 판정 |
| 캡션 범위가 화면과 다름 (B 만 셌는데 A 까지 보임) | immutable-copy | |
| 설명 글의 수 · 사실 (걸음 셈 · "차례" · "b 의 값" vs "b 가 가리키는 칸") | map-one-by-one · no-side-effect · shadowing · double-free · manual-free | |
| 동사 밖의 운동 (이름이 놓으면 객체가 "떨어져 나감" — 치워짐으로 오독 · 기준이 도달 가능성 아님) | reference-cycle | 빼게 함 |
| 재생 20 초에 0.2 초 여유 · 틱 수로 잰 시계 | memory-leak | `performance.now()` · 운동 300ms |

C6 은 메모리 · 객체 조각에 몰렸다 — 해석기가 문 종류가 많고 값(주소 · 칸)을 지어낼 여지가 크다.
감사가 같은 꼴(걸음 0 빈 장면)을 조각마다 다르게 판정한 것이 한 번 있었다. 계약 카드가 두 방식을 모두 허용하는 문구였기 때문이고,
카드를 한쪽으로 정했다(`initial()` 이 먼저, 알고리즘 셈이면 silent `init`).

## 에이전트가 짚은 것

- **`facet-shot` 이 silent 발신 뒤를 다시 찍지 않았다** — 러너의 `SceneTrack` 은 silent 로 지금 걸음 장면을 갈아 끼우고 다시 그린다.
  그래서 silent `init` 으로 걸음 0 을 채우는 조각은 "처음" 칸이 비어 보였다 (셋이 따로 짚음). **고쳤다.**
- 알고리즘 헬퍼 이름 `t` 를 i18n 검사가 문안 키로 읽는다 · C2 검사는 JSDoc 이 첫 `import` 앞에 있어야 알아본다 — 카드에 넣음.
- 수를 문장 안에 넣으면 복수형이 깨진다(en "1 open slots") · 관사 `a {cls}` 도 같은 꼴 — 카드에 넣음.
- 새 조각 디렉터리에 `node_modules` 가 없어 `piece-check` 의 tsc 가 core 를 못 찾는 때가 있다 — 한 에이전트가 링크를 손으로 만들었다.
  등록(`piece-register`)의 install 이 풀어 준다. 다른 에이전트들은 걸리지 않았다.
- 밝은 테마 `success` 가 글자색과 같은 검정 — 제어 흐름 배치에 이어 둘이 또 짚었다. 기록만.

## 표기 규약에 더한 것 (`pseudo-notation.md`)

사양 에이전트들이 규약에 없던 자리를 골랐고 호스트가 모두 받아들였다: `ref` 인자(정의 쪽만) · 변환 `int8(x)` · 목록 칸 넣기
`list[1] = 0` · 힙 칸 넣기 `valueAt(p) = v` · 목록 함수(`map` · `filter` · `reduce(list, start, f)` · `copyWith`) · 값이 없을 수 있는
상자(`box` · `empty` · `then`) · 필드 가시성 낱말 필수 · 가시성 위반은 실행 전 거부 · 정의 없는 `new Node()` · 주소 표기 `@1000`.

## 계기

```
관성        변수와 타입 PASS 0.15/0.23 · 함수 PASS 0.14/0.18 · 함수형 PASS 0.18/0.26 · 객체 지향 PASS 0.14/0.17 · 메모리 PASS 0.14/0.22
scene-audit 32/32 흔들림 0 · 왕복어긋남 0 · 완주못함 0
전수        typecheck PASS · test 2083/2083 (개념 메타가 닫혀 concept-covers-facets 통과)
```

## 개념 메타

서브도메인마다 에이전트 하나(다섯). origin 완제품이 모두 미구현이라 토픽으로 묶되 한 서브도메인을 한자리에서. 어휘 배타로 갈랐고,
먼저 닫힌 서브도메인 개념과 `contrastWith` 로 이었다(passByValueVsReference ↔ valueInPlace · aliasing, danglingReference ↔
stackVsHeap, referenceHoldsAddress ↔ pointerDereference — 이 셋만 호스트 허락으로 다른 서브도메인 파일을 고쳤다).
에이전트가 확신 못 한 자리: dynamicDispatch ↔ interfaceSlot 은 실제로 같은 메커니즘이라 층위로만 갈랐다 · "method overriding"
검색어를 methodLookupUp 에 둠 · memoryLeak ↔ lostLink(분야 넘는 대비).

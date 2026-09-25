# 프로그래밍 기초 완제품 일곱 — 배치 기록

2026-09-25. 같은 날 조각 마흔(`control-flow-piece-batch.md` · `programming-fundamentals-piece-batch.md`)을 닫은 뒤 **분야를 완제품까지
닫는** 첫 배치다. 규범은 `whole-batch-protocol.md` · `concept-meta-batch-protocol.md`. **튜닝(2026-09-25) 뒤 첫 완제품 배치**라
`whole-builder` · `whole-check` · 계약 카드가 처음 돌았다. 조각 배치와 같은 세션에서 이어 돌렸다.

## 판정 — 스물아홉에서 일곱

판정 에이전트 하나(9.4 분)가 잣대 셋을 매기고 손잡이를 `judge-sim.py` 로 돌렸다.

| 완제품 | host 토픽 | 합친 토픽 | 손잡이 | IR |
| --- | --- | --- | --- | --- |
| `loop-vs-recursion` | recursive-call → "반복과 재귀" | loop · return-value | n 1..6 — 답 · 검사 수는 같고 틀 높이만 1 대 n+1 | 둠 |
| `copy-vs-share` | argument-passing → "복사와 공유" | primitive · reference-type · reference | 건네는 것(수 · 목록 · 목록의 칸) × 부른 횟수 | 둠 |
| `polymorphism` | polymorphism | class · inheritance · interface | 받는 객체 × 부르는 이름 | **없음** — 클래스가 IR 에 없고 여섯 언어의 가상 호출 뜻이 갈린다 |
| `pure-function` | pure-function | immutability | 부르는 차례 6 × 고치기/새로 만들기 — 답 6 가지 대 1 가지 | 둠 |
| `map-filter-reduce` | map-filter-reduce | higher-order | 문턱 — filter 뒤 개수가 줄고 답이 준다 | 둠 |
| `tracing-vs-refcount` | gc | — | 놓는 이름 × 고리 — 고리가 있을 때만 계수 쪽에 쓰레기 | 둠 (수거기를 배열로) |
| `allocate-and-free` | manual-memory | stack-heap · pointer · lifetime | 바퀴 × 돌려주기(안 함 · 쓰고 나서 · 쓰기 전에 · 두 번) | 할당기만 |

**버림 아홉** — branching(기존 `conditionalStatement` 가 이미 가짐) · exception(`throw`/`try` 가 IR 에 없고 조각 하나) · type-coercion
(`integerOverflow` · `twosComplement` 와 같은 결) · scope(여섯 언어가 뜻부터 갈려 IR 코드 패널이 틀린 뜻을 보인다) · closure · currying
(IR 에 함수 값이 없고 손잡이가 조각을 되짚을 뿐) · abstraction · encapsulation · monad-basics(조각이 없거나 하나).

**사용자가 정한 것** — 합친 토픽 열셋은 카탈로그에서 **지우고 조각 `origin` 을 host 토픽으로 옮긴다**(버린 아홉과 같은 처리. 조각 열넷의
origin 이 옮겨졌다). 예외 처리는 판정대로 버린다. 카탈로그 규모 1076 → 1054 (`catalog-integrity` 하한을 사유와 함께 내렸다).

**이 분야에서 IR 이 할 수 있는 것** — 여섯 언어가 실제로 **다르게 행동하는** 자리(목록 대입 · 매개변수에 새 목록 · `ref` · 블록 스코프 ·
가상 호출 · 정수 폭)가 이 분야에 몰려 있다. IR 은 한 뜻을 여섯 글자로 옮기는 장치라 그 갈림을 보이지 못한다. 그래서 IR 은 여섯 언어가
같은 뜻인 자리에만 두고, 언어별 차이는 설명 글과 개념 메타가 밝혔다. 언어별 뜻을 보이는 장치를 코어에 만드는 일은 하지 않았다 — 만든다면
scope 같은 토픽이 되살아난다.

## 흐름

```
판정 1 (9.4 분)  →  사양 3 (묶음 가 · 나 · 다, 8.5 ~ 9.9 분 · 0.16 ~ 0.18M)
사양이 오는 대로 whole-builder 를 칸에 — 일곱이 동시에
완제품 하나 9.2 ~ 16.2 분 · 0.11 ~ 0.19M
감사 끝나는 대로 (칸 밖) · 지적은 만든 에이전트에게
등록 한 번 (--topic 으로 host 토픽에) · 관성 · 개념 메타 셋 (묶음마다, 4.6 ~ 5.6 분)
typecheck · test
```

판정을 띄운 뒤 일곱이 모두 닫히기까지 약 **1 시간**. 사양 에이전트가 판정서에서 바꾼 자리가 많았다(조각과 겹치는 데이터 · 이름을 바꿈,
pure-function 은 "목록을 돌려주면 셋이 같은 원본을 가리켜 차례에 따라 갈린다는 주장이 서지 않는다" 를 짚어 합을 돌려주게 함) — 모두 받아들였다.

## 실측 — 09-18 완제품과 견줌

| | 09-18 (컴퓨터 구조 · AI) | **이번** |
| --- | --- | --- |
| 완제품 하나 | 평균 6.1M · 33 분 | **0.11 ~ 0.19M(보고 기준) · 9 ~ 16 분** |
| whole-check 첫 통과 | — (검사기 없음) | 일곱 모두 오류 0 으로 끝냄 (공용 테스트 결함 하나 — 아래) |
| 감사 지적 | — | 일곱 중 여섯이 위반 0 · 지적은 설명 글 둘과 권고들 |

에이전트 보고의 토큰(0.1M 대)은 `subagent_tokens` 로 계기마다 셈이 달라 09-18 의 합계와 바로 견줄 수 없다 — 다음 배치에서 같은 스크립트로
다시 잰다. 시간은 셋 중 하나 수준으로 줄었다. **계약 카드와 whole-check 가 제 몫을 했다** — 코드 결함으로 돌려보낸 것이 없었다.

## 감사가 잡은 것

| 완제품 | 지적 |
| --- | --- |
| pure-function | 코드 패널이 같은 phase 줄을 한꺼번에 켜 **실행되지 않는 줄까지 켬**(판 끝 `return` · 쓰지 않는 쪽 함수) → phase 를 여섯으로 나눔 |
| loop-vs-recursion | 설명 글 "n = 100 000 이면 반복은 틀 하나, 재귀는 넘친다" — 합이 32 비트를 넘고 넘침은 언어 · 스택마다 다르다 |
| allocate-and-free | 설명 글이 화면(가상 표기)과 코드 패널(할당기)의 관계를 잇지 않음 · 새 땅 끝 수 어긋남 |
| copy-vs-share · tracing-vs-refcount | 받은 값이 비면 `?? 0` 으로 지어내는 자리(권고) · 낱말 "닫히고" → "걷히고" |

## 에이전트가 짚은 것

- **공용 테스트 결함** — `code-panel-phase` 가 `FACET_ONLY` 로 좁히면 코드 패널 없는 완제품(polymorphism)을 늘 실패시켰다. 좁혔을 때 0 을
  허용하도록 고쳤다. IR 없는 완제품이 처음이라 드러났다.
- **`waitForInput<T>` 의 제약** `T extends ReactiveInputEvent` 가 카드에 없었다 — 셋이 따로 걸렸다. 카드에 넣음.
- 헬퍼 이름 `tr` 도 C10 검사가 번역 호출로 잡는다(조각의 `t` 와 같은 자리) · 테스트가 stage 를 마운트하면 `@vitest-environment happy-dom` — 카드에 넣음.
- `facet-shot` 글자 요약이 숨긴(`visibility="hidden"`) 글자까지 찍었다 — **고쳤다.** PNG 가 운동 도중을 찍는 것(settle 400ms < 운동 560ms)은 남음.
- 첫 판의 손잡이 값은 알고리즘이 볼 수 없어 여섯이 `initialData` 에 기본값을 더하고 segments default 와 같은지 테스트로 잠갔다 — 같은 해법이
  서로 못 보는 채로 났다. 카드 조항 후보.

## 계기

```
관성        평균 0.11 · 최고 0.19 · 좌표 0.42 · 어휘 7 · 운동 7/7   PASS
whole-check 일곱 모두 오류 0 · 경고 0
전수        typecheck PASS · test 2165/2165
```

scene-audit 는 장면 조각용이라 돌리지 않았다(완제품은 projector).

## 개념 메타

묶음(가 · 나 · 다)마다 에이전트 하나. 완제품 개념 일곱을 새로 쓰고, **오늘 먼저 쓴 조각 개념 서른에 완제품을 잇는 `contrastWith`** 를 더했다.
완제품은 조작과 대비(무엇을 돌리면 무엇이 갈리는가)를 쥐고, 조각이 쥔 낱말은 definition 에서 뺐다. 나 묶음은 완제품이 가져간 검색어
(`polymorphism` · `pure function` 등)를 조각에서 덜어냈다. definition 낱말 겹침은 완제품 ↔ 조각 최고 24%(일반어).
조각 개념을 먼저 쓰고 완제품 개념을 나중에 쓴 탓에 **조각 파일 서른을 다시 열었다** — 분야별로 닫으면 묶음마다 한 번에 쓸 수 있다는 앞 판단의 근거.

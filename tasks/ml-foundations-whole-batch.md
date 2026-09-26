# 머신러닝 기초 완제품 열다섯 — 배치 기록

2026-09-26. 조각 스물다섯(`ml-foundations-piece-batch.md`)을 흘려보내는 도중에 origin 토픽 열아홉을 판정했다. 같은 세션에서 개념 메타까지 닫았다.

## 판정 — 열아홉에서 열다섯 (단독 열하나 · 합침 넷 · 버림 0)

잣대 셋(IR · 조작 · 통합, `whole-batch-protocol.md`)을 `judge-sim.py` 로 실측했다. 약한 칸이 둘 이상인 토픽이 없어 버림은 0 이었다.

| 판정 | 완제품 | host ← 합쳐진 토픽 |
| --- | --- | --- |
| 단독 | perceptron | perceptron |
| 합침 | mlp-activation | mlp("다층 퍼셉트론과 활성화") ← activation |
| 단독 | loss · backprop · dropout | 같은 이름 |
| 단독 | gradient-descent · sgd · momentum · adam · batchnorm | 같은 이름 |
| 합침 | weight-penalty | l1("L1 · L2 정규화") ← l2 |
| 단독 | early-stopping · overfitting | 같은 이름 |
| 합침 | cross-validation | cross-validation("떼어 두기와 교차 검증") ← train-val-split |
| 합침 | roc-imbalance | roc("ROC 와 혼동 행렬") ← confusion-matrix |

**사용자 결정** — 합침 넷을 받아들였다. 가장 약한 perceptron(조작 중 · 통합 약)은 단독으로 세웠다("끝나는가" 가 주장). gradient-descent 는
이웃 linear-regression 이 이미 학습률 셋을 말하지만 **두 바닥 곡선 · 출발 손잡이**로 갈라 세웠다. roc 는 문턱 손잡이를 logistic-regression 이
가졌으므로 **음성 배수**를 주인공으로. 옵티마이저 넷은 손잡이가 저마다 달라 따로 섰다 — 사양 B 가 그림 틀을 갈랐다(곡선 단면 위 뜀 ·
차례 띠 위 비낌 바늘 · 시간에 따른 w 자취 · 축마다 간 몫 막대 · 떨어져 쌓이는 점 무더기).

## 흐름

```
판정 에이전트 하나 (17.8 분 · 0.27M) — 조각 칸이 도는 동안 칸 밖에서
사양 에이전트 셋 병행 (A 망 25.6 분 · B 최적화 20.6 분 · C 정규화와 평가 18.7 분, 0.29 ~ 0.37M)
whole-builder 열다섯, 사양이 오는 대로 칸 8 로 (9.3 ~ 15.5 분, 평균 약 12.5)
감사는 끝나는 대로 둘씩
```

열다섯 모두 reactive · IR 을 둔다. 판정서가 사양에 맡긴 IR 이 무거운 셋(mlp-activation · overfitting · early-stopping)도 두었다 —
mlp 는 `exp` 에 ±3 ulp 를 섞어 돌려도 표시가 같았고, 나머지 둘은 곱 · 합 · 비교뿐이다.

## 호스트가 틀린 안내 하나 — 러너 지연

사양 B 를 검토하며 "러너가 silent 아닌 발신마다 100ms 를 더한다" 를 B 공통 안내문에 넣고, 이미 돌던 C 다섯에게도 알렸다.
gradient-descent 에이전트가 `mechanism.ts` 를 짚었다 — **그 지연은 coroutine 에만 있고 reactive `emit` 에는 없다.** 호스트가 코드로 확인하고
도는 일곱에게 정정을 보냈다. 앞서 알림을 받은 early-stopping 만 stepMs 를 550 → 450 으로 줄였다(되돌리지 않음 — 20 초 안). 컴파일러 배치 기록의
"register-allocation 이 러너 지연으로 20 초를 넘음" 도 같은 착오로 보인다. `whole-contract.md` 에 "판 길이 = 걸음 수 × stepMs" 로 옮겼다.

## 감사가 잡은 것

| 자리 | 걸린 수 | 옮긴 곳 |
| --- | ---: | --- |
| **제 손잡이의 사다리 밖 값을 `continue` 로 흘림** (남의 입력과 같은 길) | 다섯 (위반 하나 · 권고 넷) | `whole-contract.md` 입력 줄 |
| 캡션 · description 이 셈한 범위보다 넓게 — "이어 받은 몫만 남아 움직인다"(v = 0 인데), "never settles"(갱신 60 번 안), 갱신 없는 에폭에 "갱신 뒤 무게" | 셋 | (카드에 이미 있음) |
| 캡션의 수 ≠ 같은 화면 계기(갱신 16 예정 대 계기 0) | 하나 | (카드에 이미 있음) |
| projector 가 phase 가 글자가 아니면 조용히 강조를 끔 | 하나 | C6 |
| 설명 글 — 조각을 `{facet:…}` 토큰 대신 글자 이름으로(넷 중 셋이 실제 제목과 다름) · 호스트가 "쓰지 말라" 한 낱말(빠르다) · 백분율과 개수를 같다고 | 여섯 | 호스트 · 만든 에이전트 |

되감기(`onReset`)와 IR 의 `else` 몰기는 이번에 하나도 걸리지 않았다 — 컴파일러 배치에서 카드로 옮긴 두 조항이 먹혔다.
격리 이탈 하나: perceptron 이 파일 모양을 보려 조각의 `package.json` 앞 다섯 줄을 열었다(구현은 보지 않음).

## 카탈로그 정리

합친 넷의 토픽을 지우고 host 이름을 넓혔다. 옮겨진 조각의 origin 다섯을 host 로. `test/catalog-integrity.test.ts` 규모 하한 990 → 986.

## 전수 검사 하나가 규모에 걸림

닫기 전체 테스트에서 `canvas-height`(모든 facet 을 한꺼번에 띄워 9 초 지켜봄)가 60 초 한도를 넘었다. 한도를 늘린 사본으로 돌리니
798 개 · 높이 바뀜 0 · 60.7 초(나란한 세션으로 부하 평균 16) — 멈춤이 아니라 규모다. 한도를 120 초로 올렸다(`f73c41db`).

## 개념 메타

묶음 넷(망 14 · 최적화 12 · 정규화와 과적합 8 · 평가 6 = 마흔). 완제품 등록을 먼저 해 두어 `concept-covers-facets` 가 막히지 않았으나,
묶음끼리 서로의 id 를 `contrastWith` 로 가리켜 먼저 끝난 묶음은 남의 등록을 기다리는 동안 검사가 import 에서 멈췄다(모두 등록된 뒤 통과).
definition 낱말 겹침 최고 0.31(saturateAndVanish ↔ loss, 서로 다른 완제품), 같은 완제품 아래 조각끼리 0.22(pushToZero ↔ shrinkAll).

## 계측

- `whole-check` 15/15 (감사 고침 뒤 다시).
- `pnpm typecheck` 통과 · `concept:audit` 통과 · `vitest run --maxWorkers=2 --minWorkers=1` 3470 중 3469 통과 → canvas-height 한도를 올린 뒤 통과.

## 커밋

- `1b4f004c` feat(facets): 완제품 열다섯
- `2d49559e` chore(catalog): 조각 · 완제품 등록 · 토픽 넷 합침
- `f73c41db` test(core): 세로 고정 전수 검사 한도
- `0c25e959` feat(authoring): 개념 메타 마흔

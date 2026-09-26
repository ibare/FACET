# 머신러닝 기초 조각 스물다섯 — 배치 기록

2026-09-26. 머신러닝 기초(`ml-foundations`)의 남은 서브도메인 넷(신경망 기초 · 학습 메커니즘 · 정규화 · 평가)의 미구현 조각 전부를
흘려보냈다. 지도 · 비지도 학습은 앞 배치(`ml-supervised-batch.md` · `ml-unsupervised-batch.md`)에서 닫혔다. 규범은 `piece-batch-protocol.md` ·
`piece-contract.md`. 같은 세션에서 완제품 · 개념 메타까지 닫았다(`ml-foundations-whole-batch.md`). worktree `facet-batch1`, 칸 여덟, 검사기 워커 2.

## 흐름

```
사양 넷 (서브도메인마다 하나, 8.4 ~ 9.7 분 · 0.13 ~ 0.15M)
사양이 오는 대로 쪼개 칸 8 에 — 하나 끝나면 대기열에서 다음 (대기열은 서브도메인을 번갈아 섞었다)
조각 하나 6.6 ~ 11.3 분 (평균 약 9)
감사 칸 밖 · 끝나는 대로 둘씩
```

| 서브도메인 | 조각 |
| --- | --- |
| neural-basics | 6 — weighted-sum-threshold · layers-compose · hidden-layer-features · nonlinear-bends · saturate-and-vanish · loss-measures-wrongness |
| learning-mechanism | 8 — learning-rate-too-big · local-minimum · one-batch-at-a-time · noisy-path · carry-velocity · per-parameter-step · error-flows-backward · gradient-through-layers |
| regularization | 5 — push-to-zero · shrink-all · drop-random-units · rescale-each-batch · stop-before-turn |
| evaluation | 6 — hold-out-some · rotate-the-fold · threshold-slides · four-boxes · memorize-vs-generalize · train-down-val-up |

여유 메모리는 조각 칸 동안 73 ~ 81%, 완제품 칸이 여덟으로 찼을 때 한 번 52% 까지 내려갔다(검사기 · 크롬 합계 11GB). PID 1 밑 고아는 끝까지 0.

## 수치 규약 — 분야 지시문에 한 번에

수치 분야라 앞 배치에서 걸린 둘을 지시문에 먼저 넣었다: **1차 데이터는 화면에 줄 값 그대로이고 대조값은 그 값에서 다시 셈한다**
(ml-unsupervised 의 반올림 좌표), **셈과 표시를 가른다**(JS `toFixed` 흉내 · 경계 …5 와 `-0.00` 이 나오면 데이터를 바꾼다). 그리고 딥러닝 배치의
**동사를 `sim.py` 가 걸음마다 단언한다**. 사양 에이전트 넷이 모두 데이터를 바꿔 경계를 피했다(예: L1 η 0.5 → 0.4, 배치 정규화 σ² 경계, loss 의
누적 합이 표시 두 수의 합과 글자로 어긋나던 자리).

## 사양에서 호스트가 정한 것

- **축을 가른다** — stop-before-turn 은 에폭 축, train-down-val-up 은 모형의 유연함(차수) 축. 같은 두 곡선 그림으로 모이지 않게.
- hidden-layer-features 의 특징이 교과서의 OR · AND 가 아닌 것을 받아들였다 — "제 나름의" 가 주장이다.
- L1 · L2 의 데이터 손실을 ½·Σ(w−a)²(특징이 겹치지 않는 선형 회귀)로 줄였다 — 설명 글이 밝힌다.
- 정규화 조각은 "무게 막대" 그림을 쓰기 쉬워 per-parameter-step 은 **보폭과 움직임**을 그리게 했다.
- stop-before-turn 의 오름(0.033 → 0.037)은 선형 눈금으로 3px 라 만든 에이전트가 로그 눈금으로 풀었다 — 받아들였다.

## 감사가 잡은 것

감사 열셋. 스물다섯 중 스물하나가 위반 0 (권고만 고친 것 포함) — 위반 넷(saturate-and-vanish · local-minimum · threshold-slides · memorize-vs-generalize)은 만든 에이전트나 호스트가 고쳤다.

| 자리 | 걸린 수 | |
| --- | ---: | --- |
| 설명 글의 셈이 틀림 — AUC 0.78 을 동률 없이 설명(19/25 = 0.76), 띠를 L2 몫이라 부름(데이터 항이 섞임) | 둘 | High · 만든 에이전트 |
| 장면이 개수를 셈 — memorize-vs-generalize 가 맞힌 수를 장면에서 더함 | 하나 | S-scene |
| 캡션이 셈하지 않은 결론 — "z = 3 자리와 같다" 를 견주지 않고 거울 여부로 박음 | 하나 | S-piece |
| 무대가 주장의 값을 고름 — train-down-val-up 이 검증 바닥 차수를 스스로 찾음 | 하나 | 권고 → 고침 |
| 같은 낱말 두 뜻 — "걸음"(장면 단위 · 움직임), "크기"(부호 붙은 기울기 · 절댓값), "0 인 무게"(개수 · 머리말) | 셋 | 호스트 · 만든 에이전트 |

**표기 하나를 배치 전체에서 바로잡았다** — FP 의 한국어를 조각 둘과 카탈로그 desc 가 "헛집음" 으로 적었다. 맞춤법은 "짚다" 에서 온
**헛짚음**이다. 완제품 사양 에이전트가 이웃 logistic-regression 과 견주다 짚었다.

## 계측

- `piece-check` 25/25 (감사 고침 뒤 다시).
- 관성: 평균 코드 유사도 **0.13** · 최고 **0.20**(per-parameter-step ↔ shrink-all) · 최고 좌표 겹침 **0.55**(carry-velocity ↔ rotate-the-fold) ·
  그림 어휘 **8종** · 운동 **24/25**. PASS.
- `scene-audit` 25/25 — 흔들림 0 · 왕복 어긋남 0 · 띠 없음 0 · 완주 못함 0 (사용자 vite 5173 — 이 worktree 의 것).

## 커밋

- `e33de235` feat(facets): 머신러닝 기초 조각 스물다섯
- `2d49559e` chore(catalog): 등록 (완제품과 함께)

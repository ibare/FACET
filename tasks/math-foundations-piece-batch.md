# 수학 기초 조각 마흔둘 — 배치 기록

2026-09-27. 분야 전체가 비어 있던 수학 기초(선형대수 · 확률과 통계 · 미적분 · 이산수학)의 조각 마흔둘을 칸 열로 흘려보냈다.
새 도메인 디렉터리 `facets/math-foundations/`. worktree `facet-batch3` 에서 다른 분야 세션과 나란히 돌았다. 규범은 `piece-batch-protocol.md` ·
`piece-contract.md`. 같은 세션에서 완제품 · 개념 메타까지 닫았다(`math-foundations-whole-batch.md`).

## 흐름

```
사양 일곱 (벡터 6 · 행렬 7 · 고유값과 SVD 4 · 확률 7 · 미적분 7 · 집합과 그래프 5 · 조합과 정수론 6 — 5 ~ 10 분)
사양이 오는 대로 쪼개 칸 10 에 — 하나 끝나면 대기열에서 다음
조각 하나 5 ~ 11.5 분 (평균 8 분 안팎)
감사 칸 밖 · 끝나는 대로 둘~넷씩 · 지적은 만든 에이전트에게
```

| 서브도메인 | 조각 |
| --- | --- |
| linear-algebra | vector-as-arrow · vector-add-tip-to-tail · vector-scale · dot-product-shadow · vector-normalize · cross-product-perpendicular · matrix-as-transform · matrix-columns-are-basis · matvec-as-combination · matrix-product-chain · determinant-area · determinant-zero-collapse · inverse-undoes · eigenvector-direction · power-iteration-drift · svd-three-steps · low-rank-approx |
| probability-stats | histogram-shape · mean-and-spread · conditional-narrowing · bayes-update · base-rate · clt-bell · law-of-large-numbers |
| calculus | secant-to-tangent · chain-rule-multiply · riemann-sum · fundamental-theorem · partial-slice · gradient-steepest · gradient-step |
| discrete-math | set-operations · inclusion-exclusion · power-set · handshake-lemma · bipartite-coloring · product-rule-tree · permutation-vs-combination · pascal-triangle · modular-clock · euclid-gcd · sieve-of-eratosthenes |

## 사양에서 호스트가 정한 것

- **이웃 분야와 질문을 가른다.** `graphics/matrix-transform-2d`(기저 도착지 → 평면이 휜다)가 matrix-as-transform · matrix-columns-are-basis 와 거의 같은
  주장이라, 사양이 열을 규칙에서 적어 가고 · 넓이를 "어떤 도형이든 같은 배수" 로 · det 0 을 "점이 포개짐" 으로 셌다. `cs-fundamentals` 의
  euclidean · sieve · two-color-conflict 와는 **절차 대 수학적 사실**(공약수 보존 · p × p 앞은 이미 지워짐 · 성공 사례만)로 갈랐다.
- **무작위는 식까지.** 표본이 수백인 셋(histogram-shape · clt-bell · law-of-large-numbers)은 mulberry32 의 전체 코드 · 씨앗 · 변환식을 사양에 두었다.
  씨앗은 동사 단언을 만족하는 첫 수로 골랐고, 설명 글이 "한 번의 뽑기 · 고른 씨앗" 을 밝힌다.
- 판단 자리는 모두 받아들였다 — 스칼라 곱은 양수 k 만(음수는 설명 글) · 이분 그래프는 칠해지는 사례만(부딪힘은 이웃 조각) · 체의 멈춤 걸음은 둔다 ·
  리만 합의 참값 π 는 원 넓이라는 기하 사실로 · matrix-as-transform 의 "움직인 거리 = 원점 거리" 는 이 행렬의 우연이라 일반화 금지를 사양에 덧붙였다.
- **sim 이 사양 동사를 고쳤다.** pascal-triangle "가장 큰 수가 커진다" 는 줄 1 에서 거짓 → "줄 2 부터". law-of-large-numbers 는 1000 번에서 차가 도로
  커져 "차가 줄어든다" 대신 "흔들림의 폭이 좁아진다". clt-bell 의 n 수열은 칸 폭과 맞물려 빗살이 생겨 1 · 2 · 6 · 10 · 30 으로 바꿨다.

## 감사가 잡은 것

지난 배치의 방침(reduce 던짐 · initial 안 지어냄 · 좁히개)은 **한 번도 걸리지 않았다.** 이번에 되풀이해 걸린 것은 셋이다.

- **무대가 주장의 셈을 운동 중 다시 돌림** 다섯 — modular-clock(몫 · 나머지를 export `splitByModulus` 로) · power-iteration-drift(운동 도중 A·v) ·
  svd-three-steps(한 번에 곱하기를 매 틀 A·p) · vector-add-tip-to-tail(머리 = 꼬리 + 벡터) · histogram-shape("큰 눈" 규칙). **원인은 호스트 공통
  안내문이다** — "그림이 같은 셈을 필요로 하면 export 한 함수를 부른다" 를 범위 없이 적었다. 계약 카드 136 · 228 행의 범위(바탕에서 정해지는 작은 셈)를
  안내문에 덧붙인 뒤 띄운 조각에서는 줄었다. 계약 카드 함정 목록 · `piece-batch-protocol.md` "호스트가 지킬 것" 에 옮겼다.
- **설명 글의 재생 길이가 사양 추정치** 셋 — inclusion-exclusion "15 초"(실제 12) · vector-add-tip-to-tail "11 초"(실제 8.4) 등. 사양이 걸음 0 의 운동과
  마지막 걸음 뒤 sleep 을 더해 셌다. 공통 안내문에 덧붙인 뒤로 조각들은 코드의 합으로 세거나 길이 문장을 뺐다.
- **설명 글의 일반 명제가 틀림** 넷 — matrix-columns-are-basis "선형 = 원점을 지키고 곧은 줄을 곧게" (사영 변환 반례) · partial-slice "두 틀의 가로 ·
  세로 축척이 같다"(92.7 대 21.1 px) · law-of-large-numbers "씨앗이 달라도 같다"(셈하지 않음) · product-rule-tree 합의 법칙 예가 두 자리만.
- 그 밖에 dot-product-shadow — `shadow > 0` 이면 "더 벌어진다" 를 고르는데 사이각을 비교한 적이 없고, 마지막 걸음 "원점을 지나" 는 이미 반대쪽이었다
  (갈래를 알고리즘이 셈해 싣게). set-operations "한쪽에서 하나씩"(ko · ja) · cross-product-perpendicular 가 그림용 좌표를 장면에 담음 ·
  determinant-zero-collapse · euclid-gcd 의 `?? 0` · 앞 장면 대조 없음(C6).
- 판정이 갈릴 뻔한 자리: fundamental-theorem · gradient-steepest 는 무대가 payload 두 값을 견줘 캡션 갈래를 고르는데, 갈래의 결론이 **곧 그 비교**라
  dot-product-shadow 와 다르게 통과. eigenvector-direction 의 걸음 0 장부에 훑을 벡터 목록이 보이는 것은 사양 문구("벡터 없음")와 어긋나지만 답을
  드러내지 않아 호스트가 두었다.

## 호스트 도구에서 걸린 것

- `facet-shot` 은 `SVGRectElement` 같은 DOM 전역이 없어 `instanceof` 가 `ReferenceError` (permutation-vs-combination) · 칸이 많은 조각(체 59 칸)은
  글자 요약이 칸 번호로 차서 캡션이 안 보인다 — 감사가 SVG 에서 글자를 뽑아 봤다.
- 표기 검사가 문안 자리 표시자 `{lambda}` 를 다른 언어 흔적으로 잡았다(eigenvector-direction).
- 칸 수를 한때 12 로 넘겼다 — 고치러 돌려보낸 에이전트를 칸에서 빼고 셌다. 대기열 셈을 zsh 의 낱말 나누기 없는 `for` 로 하다 한 줄로 넣은 적이 있다
  (띄우기 전에 잡았다).

## 계측

- `piece-check` 42/42 (각 에이전트 · 고침 뒤 재검).
- 관성: 평균 코드 유사도 **0.11** · 최고 0.23(vector-scale ↔ law-of-large-numbers) · 최고 좌표 겹침 0.48 · 그림 어휘 8 종 · 운동 41/42. PASS.
- `scene-audit` 42/42 — 흔들림 0 · 왕복 어긋남 0 · 띠 없음 0 · 완주 못함 0 (사용자 vite 5175 — 이 worktree 의 것). 첫 실행이 16 번째
  (low-rank-approx)에서 멈췄다 — Chrome · 스크립트 모두 CPU 0 으로 `Runtime.evaluate` 응답을 기다렸고 스크립트의 3 분 멈춤 끊기는 그 await 에
  닿지 못했다. 끊고 남은 26 과 앞 16 을 따로 다시 재 모두 깨끗했다 — 조각이 아니라 도구 쪽 멈춤으로 본다(재현하지 않았다).

## 커밋

- `d51de46f` feat(facets): 수학 기초 조각 마흔둘
- `d815a51a` chore(catalog): 수학 기초 조각 마흔둘 등록

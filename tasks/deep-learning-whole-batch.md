# 딥러닝 완제품 열셋 — 배치 기록

2026-09-26. 조각 스물아홉(`deep-learning-piece-batch.md`)을 흘려보내는 동안 origin 토픽 열일곱을 판정했다. 같은 세션에서
개념 메타까지 닫았다.

## 판정 — 열일곱에서 열셋(단독 아홉 · 합침 넷 · 버림 0)

판정 에이전트 하나가 잣대 셋을 `judge-sim.py` 로 실측했다(18.8 분). 사용자가 합침 넷 · gan 만듦 · positional-encoding 단독을 정했다.

| 판정 | 완제품 | 토픽 (← 흡수) | 손잡이 |
| --- | --- | --- | --- |
| 단독 | convolution | convolution | 보폭 × 패딩 |
| 합침 | receptive-field | receptive-field ← pooling | 층 수 × 풀링 |
| 단독 | learned-filter | filter-viz | 가려낼 무늬 (창을 브라우저에서 학습) |
| 합침 | unrolled-rnn | bptt ← sequence-process | w_h |
| 합침 | gated-cells | lstm ← gru | 셀 RNN/GRU/LSTM × 방해 입력 수 |
| 합침 | self-attention | self-attention ← multi-head | 머리 수 |
| 단독 | positional-encoding | positional-encoding | d_model (IR 없음 — sin · cos 가 예약 수학 이름 밖) |
| 단독 | vae · gan · diffusion | 같은 이름 | β · 출발 자리 · 걷어내는 걸음 수 |
| 단독 | mdp · q-learning · policy-gradient | 같은 이름 | γ × 미끄러짐 · ε · 기준값 × 상에 더한 값 |

**실측에서 뒤집힌 판단**: pooling 은 "최댓값 풀링은 밀림에 둔하다" 를 쟀더니 풀링 없는 지도가 더 그대로여서 단독 손잡이를 버리고
receptive-field 에 합쳤다. w_h 1.5 는 tanh 포화로 도로 줄어 사다리를 1 아래 셋으로 뒀다. q-learning 은 mdp 격자에서 큰 목표를 거의
못 찾아 복도 세계로 갈랐다. √d_k 손잡이는 d 128 을 화면에 보일 수 없어 뺐다.

## 사양 — 넷으로 나눠 병행

A 격자(conv · rf · lf, 11 분) · D 어텐션(sa · pe, 11.7 분) · B 셀과 학습(rnn · gated · vae · gan, 21.3 분) · C 표본과 행위자(diff · mdp · q ·
pg, 21 분). 판정의 `conventions.md` 한 장(표시 반올림 · 생성기 · tanh 식)을 넷이 함께 읽었다. 지시문에 "동사를 sim 에서 걸음마다 단언" 을
넣었고 B 는 단언 107 줄, C 는 44 줄을 두었다. 사양이 판정을 고친 자리 — gan 의 가운데는 칼날이 아니라 띠(|b| ≤ 0.265 면 둘로 갈림),
vae 의 이웃 겹침은 β 2 에서만 선다, positional-encoding 은 짝이 아니라 간격으로 센다(같은 간격의 짝은 정확한 동률).

## 흐름

완제품 칸은 **여덟** — 세 세션이 나란히 돌아 검사 한 번이 무거운 완제품을 열로 두지 않았다. 완제품 하나 8.5 ~ 12.8 분(평균 10.6).
감사는 둘씩 칸 밖에서.

## 감사가 잡은 것 — 검사기가 못 보는 두 자리

1. **phase 를 걸음 발신 뒤에 보냄.** 자취(`timeline.ts`)는 silent 아닌 발신에서 걸음을 끊어, 발신 뒤 silent phase 는 되짚기에서 다음
   걸음에 묶인다. 재생 중에는 sleep 이 경계라 드러나지 않고 whole-self-check 도 재생 중 경계만 본다. diffusion 감사가 찾았고, 호스트가
   도는 완제품과 이미 닫힌 완제품에 확인을 돌리자 **감사가 위반 0 으로 닫았던 policy-gradient** 에서도 나왔다. q-learning 은 다음 감사가 잡았다.
2. **되짚기 때 무대가 한 벌씩 늘어남.** 되짚기는 `onReset` 뒤 자취 첫 줄(silent init)부터 다시 먹이는데, learned-filter 의 첫 그림은
   svg 를 비우지 않고 덧붙였다(272 → 544 요소, 새 칸이 옛 음영을 덮어 빈 칸으로 보임). `onReset` 이 없는 완제품 다섯에 멱등 확인을 돌려
   모두 멱등임을 테스트로 잠갔다.

둘 다 `whole-contract.md` 에 조항으로 옮겼다. 검사기 보강(되짚기 기준 phase 수집 · 첫 그림 두 번 투입)은 다음 일로 남긴다.

그 밖: gan 은 **호스트가 사양에 덧붙인** "두 라운드마다 하나를 보인다" 때문에 건너뛴 라운드의 만듦이 가려냄 걸음에 실려 G 의 움직임이
D 의 학습으로 읽혔다(라운드 4 에서 가려냄 걸음의 가짜 이동 0.73 > 만듦 걸음 0.30) — 한 걸음 안에서 운동을 둘로 차례 지워 고쳤다.
걸음 0 이 450ms 로 덧붙임의 800ms 에 못 미친 것도 잡혔다. 설명 글의 셈(diffusion "가운데 근처에서 반반" · q-learning "다섯 모두" ·
self-attention "자른다") · 손잡이 입력을 `continue` 로 흘림(mdp · receptive-field · self-attention) 도 고쳤다.

## 호스트 도구에서 걸린 것

- `facet-shot` 이 projector 경로에서 silent init 뒤 걸음 0 을 다시 찍지 않아 "처음" 칸이 빈 무대로 나온다 — 셋이 같은 자리에서 멈칫했다.
  계약 카드에 "도구의 빈틈 — 걸음 0 은 테스트로" 를 적었고 도구는 고치지 않았다.
- 루트 `pnpm test` 는 워커 제한이 없다(13) — 닫기 검사는 `npx vitest run --maxWorkers=4 --minWorkers=1` (`piece-batch-protocol.md` 병렬 절).

## 계기

whole-check 13/13 · 관성 평균 유사도 **0.07** · 최고 0.11 · 최고 좌표 겹침 0.40 · 그림 어휘 8 종 · 운동 13/13. PASS.

## 개념 메타

묶음 다섯(CNN · RNN · 어텐션 · 생성 · 강화 학습)을 에이전트 다섯이 7.1 ~ 9 분에 썼다 — 마흔둘. 묶음 안 definition 겹침 최고
0.26(learnedFilter ↔ filtersLearnEdges, 짧은 쪽 기준). 완제품이 분류표에 등록되기 전에 먼저 끝난 묶음 둘은 `concept-covers-facets` 가
"분류표에 없는 canonicalFacet" 으로 멈춰 임시 스크립트로 덮임을 확인했다 — **완제품 등록을 개념 메타 앞에 둔다.**
`concept:audit` 통과 · typecheck 통과 · `vitest --maxWorkers=4` **2979/2979**.

## 커밋

- `1f3587eb` feat(facets): 딥러닝 완제품 열셋
- `f7e16665` chore(catalog): 딥러닝 완제품 열셋 등록
- `1f3523a1` feat(authoring): 딥러닝 개념 메타 마흔둘

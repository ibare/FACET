# 딥러닝 조각 스물아홉 — 배치 기록

2026-09-26. 딥러닝 서브도메인 다섯(CNN · RNN · 어텐션과 트랜스포머 · 생성 모델 · 강화 학습)의 미구현 조각 전부를
칸 열로 흘려보냈다. worktree `facet-batch3` 에서 다른 분야 세션 둘과 나란히 돌았다. 규범은 `piece-batch-protocol.md` ·
`piece-contract.md`. 같은 세션에서 완제품 · 개념 메타까지 닫았다(`deep-learning-whole-batch.md`).

## 흐름

```
사양 다섯 (서브도메인마다 하나, 5.3 ~ 10.1 분 · 0.10 ~ 0.14M)
사양이 오는 대로 쪼개 칸 10 에 — 하나 끝나면 대기열에서 다음
조각 하나 5.5 ~ 11.9 분 (평균 8 분 안팎)
감사 칸 밖 · 끝나는 대로 둘~셋씩 · 지적은 만든 에이전트에게
```

| 서브도메인 | 조각 |
| --- | --- |
| cnn | slide-the-kernel · weight-sharing · stride-and-padding · shrink-by-summary · filters-learn-edges · field-grows-with-depth |
| rnn | carry-hidden-state · same-weights-each-step · gate-lets-through · cell-carries-long · fewer-gates · unroll-then-backprop · vanishing-over-time |
| transformer | query-key-value · attend-to-all-at-once · attention-weights · several-views · order-must-be-added |
| generative | encode-to-distribution · sample-and-decode · two-nets-compete · mode-collapse · add-noise-then-remove · denoise-step-by-step |
| rl | state-action-reward · discount-future · value-of-action · explore-vs-exploit · nudge-toward-reward |

메모리: 검사기 워커 2 (`db9e0629`) 아래 세 세션이 나란히 도는 동안 여유 73 ~ 80% 를 오갔다(36GB). 고아 vitest · headless Chrome 0.

## 사양에서 호스트가 정한 것

- 분야 지시문에 **실수의 셈과 표시를 가르는 규약**을 넣었다 — Python `round()` 는 짝수 쪽 반올림이라 JS `toFixed` 와 갈린다. 다섯 사양
  에이전트 모두 `sim.py` 에 JS 와 같은 표시 함수를 두고, 반올림 경계(…5) · `-0.00` 이 나오면 데이터를 바꿨다.
- **무작위는 뽑힌 값을 데이터로** — 잡음 ε · 주사위 · 탐험 차례를 PRNG 규약 대신 값으로 적었다. 동률 규칙도 사양마다 적었다.
- 판단 자리는 모두 받아들였다 — weight-sharing 을 1 차원으로(격자 그림과 가르려고), explore-vs-exploit 를 한 자리 문 고르기(밴딧)로,
  mode-collapse 가 시작값에 달린 결과라는 것 · 확산의 이상적 예측기는 설명 글과 개념 메타가 밝힌다.

## 감사가 잡은 것 — 공통 안내문의 방침이 늦게 섰다

첫 감사(weight-sharing · shrink-by-summary)의 권고와 둘째 감사의 C6 지적이 같은 자리를 짚었다 — 장면 `reduce` 가 모르는 이벤트를
`return scene` 으로 삼킴, `initial` 이 자료가 없을 때 0 · 빈 배열을 지어 넣음, algorithm 이 `ctx.data` 를 좁히지 않음. 호스트가
공통 안내문 다섯에 **방침**으로 덧붙였지만 이미 띄운 열다섯은 그 전 안내문으로 돌고 있었고, 그 열다섯은 거의 모두 셋 중 하나 이상에
걸렸다. 덧붙인 뒤 띄운 gate-lets-through 는 위반 0 이었다. 뒤이어 "무대가 대체값으로 넘기지 않는다" · "무대가 알고리즘 셈을 다시 돌려
장면 밖 값을 만들지 않는다" 가 더해졌다. 다섯 모두 `piece-contract.md` 에 조항으로 옮겼다.

**감사 둘이 판정을 갈랐다.** `reduce` 의 `default: return scene` 을 하나는 C6 Medium, 하나는 "S-scene · C6 에 MUST 가 없고 저장소 장면
1114 곳이 같은 꼴" 이라 권고로 봤다. 장면에 오는 이벤트는 알고리즘의 발신뿐이라(mechanism → runner → sceneTrack) 모르는 type 은 어휘가
어긋났다는 뜻이다 — 이 배치는 "던진다" 로 통일했고 계약 카드 scene 절이 판정을 가진다.

그 밖의 지적: two-nets-compete 의 **사양 동사가 셈과 어긋남**("가려내는 쪽이 배우면 점수 차가 벌어진다" 가 걸음 5 · 7 · 9 에서 거짓 —
사양 에이전트 잘못, 만든 에이전트가 옮김) · 무대가 알고리즘 셈으로 축 범위를 다시 셈(encode-to-distribution · sample-and-decode ·
order-must-be-added) · 설명 글의 셈(vanishing-over-time 의 "몫은 크게 깎이지 않는다" 등). 모두 만든 에이전트가 고쳤다.

## 격리 이탈 둘

same-weights-each-step 이 형제의 설명 글(`weightSharing.md`)을, encode-to-distribution 이 형제의 package.json · tsconfig 와 설명 글을
열었다. 둘 다 구현은 보지 않았고 "파일 모양의 본보기" 를 찾다가 그랬다 — 전자는 오히려 그림을 가르는 쪽으로 썼다. 프롬프트의
격리 줄에 설명 글과 package.json 을 넣었다(`piece-batch-protocol.md` 호스트가 지킬 것).

## 호스트 도구에서 걸린 것

- 호스트 셸이 zsh 라 `for n in $N` 이 변수를 쪼개지 않아 대기열 · 프롬프트 파일이 이름 여럿을 한 줄로 묶어 만들었다. 이름을 직접
  늘어놓아 다시 만들었다 (스크래치패드 스크립트의 일이라 저장소는 고치지 않았다).
- 편집 직후 stage 파일이 디스크에서 다시 포맷되었다는 보고가 둘(`−` 이스케이프가 글자로 풀림) — 내용은 같고 검사도 통과했다.

## 계측

- `piece-check` 29/29 · typecheck 통과 · `vitest --maxWorkers=4` 2770/2771 (남은 하나는 개념 메타 미연결 — 완제품 배치에서 해소).
- 관성: 평균 코드 유사도 **0.14** · 최고 0.28(carry-hidden-state ↔ same-weights-each-step) · 최고 좌표 겹침 0.52 · 그림 어휘 9 종 ·
  운동 29/29. PASS.
- `scene-audit` 29/29 — 흔들림 0 · 왕복 어긋남 0 · 띠 없음 0 · 완주 못함 0 (사용자 vite 5175 — 이 worktree 의 것).

## 커밋

- `e6acf600` chore(catalog): 완제품 판정에 따라 토픽 넷을 합침
- `58d331c5` feat(facets): 딥러닝 조각 스물아홉
- `9e1374f3` chore(catalog): 딥러닝 조각 스물아홉 등록

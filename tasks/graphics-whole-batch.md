# 컴퓨터 그래픽스 완제품 여섯 — 배치 기록

2026-09-27. 조각 스물넷(`graphics-piece-batch.md`)의 사양과 나란히 구현 안 된 origin 토픽 열둘을 판정했고, 같은 세션에서 완제품과
개념 메타까지 닫았다. 이 분야의 완제품 `matrix-transform-2d` 는 이미 있었다.

## 판정 — 열둘에서 여섯(합침 여섯 · 버림 0)

판정 에이전트 하나(14.3 분 · 0.21M)가 잣대 셋(`whole-batch-protocol.md`)을 매기고 `judge-sim.py` 로 손잡이를 실측했다.
사용자가 "판정 나오는 것 결정으로" 진행하라고 미리 정했다.

| 완제품 | 흡수한 토픽 | 손잡이 |
| --- | --- | --- |
| scale-rotate-translate "변환의 합성" | homogeneous | 합성 순서 6 × 회전 중심 2 |
| projection "카메라와 투영" | camera-model · clipping | 눈의 거리 6 × 투영 2 |
| rasterization | — | 꼭짓점 깊이 6 × 가림 방식(깊이 버퍼 / 화가) |
| brdf "반사 모형" | phong · pbr | 모형(퐁 / PBR) × 광택 5 |
| ray-tracing-base "광선 추적" | ray-casting | 굴절률 5 |
| global-illumination | — | 반사율 5 |

여섯 모두 IR 을 둔다. 홀로 두 칸 이상 약한 넷(homogeneous · clipping · brdf · ray-casting)은 버리지 않고 이웃 완제품의 손잡이가 그 장면을 잇게 합쳤다.
`matrix-transform-2d` 를 host 로 흡수하는 안은 그 주장("원점 고정")과 옮김("원점이 떠난다")이 부딪혀 두지 않았다.
**카탈로그** (커밋 `4bbc4456`): 토픽 여섯 삭제, origin 열하나 옮김, host 넷 개명. `catalog-integrity` 하한 975 → 969.

호스트가 정한 것: projection 의 셋째 손잡이(바라보는 점)는 뺐다(양 끝 두 값에서만 대칭으로 갈렸다). global-illumination 의 색 번짐 폭이
좁아(1.03 ~ 1.22) 빨간 벽을 (ρ, 0, 0) 으로 두게 했다 — 사양이 재는 값을 R − B 로 바꿔 약 40 배로 벌어졌다.

## 사양 — 셋으로 나눠 병행

| 묶음 | 완제품 | 시간 |
| --- | --- | --- |
| 기하 | scale-rotate-translate · projection | 10.0 분 · 0.19M |
| 칸과 빛 | rasterization · brdf | 12.5 분 · 0.20M |
| 광선 | ray-tracing-base · global-illumination | 15.7 분 · 0.23M |

사양 에이전트가 판정에서 고친 것: 사다리 값이 반올림 경계에 붙는 자리를 옮겼다(global-illumination 0.8 · 0.95 → 0.75 · 0.85,
ray-tracing-base 1.33 → 1.4). 멈춤 규칙을 "끝 값 대비 1 %" 에서 튐마다 셀 수 있는 꼴로 바꿨다. brdf 의 가림 항을 형제 조각과 같은 Schlick-GGX 로 맞췄다.
brdf IR 적분이 무거울 수 있어(곱 51 만 번) 호스트가 "해석기 한 판 1 초 넘으면 가볍게" 를 덧붙였다 — 실측 0.35 초라 그대로 두었다.

## 만들기 · 감사

whole-builder 가 조각과 같은 칸 여섯에 번갈아 흘렀다. 하나 12.0 ~ 16.8 분. 모두 `whole-check` 오류 0.
판 머리 걸음 경계(앞 배치에서 넷이 걸린 자리)는 이번엔 여섯 모두 처음부터 섰다 — 계약 카드 조항과 공통 안내문 줄이 먹혔다.
관성 계측(완제품 여섯): 평균 **0.07** · 최고 **0.09** · 운동 **6/6**.

감사가 잡은 새 꼴:

- **손잡이 끝값에서 캡션의 동사가 거짓** — ray-tracing-base 는 굴절률 1.0 에서도 "법선 쪽으로 꺾인다" 를 띄웠고(같은 화면의 수는 63.3° → 63.3°),
  rasterization 은 틀린 칸이 0 인 판에서도 "표지가 선 칸은 다르다" 를 띄웠다. 판정을 algorithm 이 싣고 문안을 고르게 했다. 계약 카드 projector 절에 올렸다.
- **수 자리 표시자 뒤 조사** — brdf `조도 {incoming} 로`. 카드에 이미 있는 조항이다.
- 채널 막대 원색(global-illumination) — 조각 배치 기록의 색 절과 같은 판단.

## 개념 메타 — 묶음 여섯

여섯 에이전트가 완제품 여섯 · 조각 스물넷 = **서른**을 썼다(각 5.0 ~ 6.1 분). 완제품을 먼저 등록하고 띄웠다.
앞서 끝난 묶음은 다른 묶음의 미선언 참조 때문에 audit 를 끝까지 못 돌렸고, 마지막 묶음이 전체를 돌려 통과했다.
`concept:audit` 기계 판정 통과(어휘 후보 22 건은 모두 이전 분야 개념) · definition 겹침 묶음 안 최고 0.25(`projection` ↔ `perspectiveShrinksFar`).

## 닫기

typecheck 통과 · 테스트 **3904/3904**(`--maxWorkers=2 --minWorkers=1`, 345 초) · scene-audit 24/24 · 고아 0.

# 개발 도구 완제품 열 — 배치 기록

2026-09-26. 조각 서른셋(`dev-tooling-piece-batch.md`)을 만드는 동안 origin 토픽 열아홉을 판정했고, 조각이 닫힌 뒤 완제품과
개념 메타까지 같은 세션에서 닫았다.

## 판정 — 열아홉에서 열(합침 일곱 · 버림 둘)

판정 에이전트 하나(14.6 분 · 0.25M)가 잣대 셋(`whole-batch-protocol.md`)을 매기고 `judge-sim.py` 로 손잡이를 실측했다.
사용자가 판정 그대로 확정했다.

| 완제품 | 흡수한 토픽 | 손잡이 | IR |
| --- | --- | --- | --- |
| myers-diff "줄 단위 diff" | longest-common-subsequence | 고친 줄 × 파일 길이 | 둠 |
| three-way-merge "3-way 병합과 충돌" | conflict-resolution | 우리 쪽이 한 일 × 그쪽이 고친 줄 | 둠 (덩이 판정) |
| rebase-vs-merge "병합과 리베이스" | commit-dag · merge-base | 합치는 길 × main 의 새 커밋 | 없음 — 해시 셈에 비트 연산 |
| history-bisect | — | 깨진 빌드 수 × 자리 | 둠 |
| dependency-graph | — | 일꾼 수 × codegen.o 초 | 둠 |
| incremental-build | — | 판정 방식 × 고친 모양 | 둠 |
| cache-invalidation | — | 층 차례 × 바뀐 파일 | 없음 — 열쇠 사슬이 비트 연산 |
| semantic-versioning "버전 범위와 잠금" | lockfile | 내보낸 바뀜 × 받는 쪽 | 둠 |
| dependency-resolution | — | table 의 범위 × 해결기 | 둠 |
| branch-coverage "커버리지와 변이 점수" | statement-coverage · mutation-testing | 시험 수 | 둠 (대상 함수 그 자체) |

**버림 둘**: `circular-dependency`(손잡이가 고리 켬/끔 둘뿐이라 조각 장면을 되풀이하고 `cycle-blocks-order` 와 같은 말) ·
`counterexample-shrinking`(어디서 시작해도 `[10]` 으로 모이고 후보 수가 단조가 아니다). 그 조각(`nobody-can-be-first` ·
`shrink-to-smallest`)은 조각으로 남고 origin 문자열은 그대로 둔다.

**카탈로그** (커밋 `71fdafad`): 아홉 항목 삭제, 합친 조각의 origin 을 host 로 옮김, host 다섯 개명.
`catalog-integrity` 하한 1008 → 999.

## 사양 — 셋으로 나눠 병행

| 묶음 | 완제품 | 시간 |
| --- | --- | --- |
| 줄과 커밋 | myers-diff · three-way-merge · rebase-vs-merge · history-bisect | 14.5 분 · 0.25M |
| 빌드 | dependency-graph · incremental-build · cache-invalidation | 10.0 분 · 0.20M |
| 버전과 시험 | semantic-versioning · dependency-resolution · branch-coverage | 10.0 분 · 0.19M |

사양 에이전트가 판정에서 고친 것: myers-diff 파일 길이 사다리 6·12·24·48 → 10·20·30·40(N=6 은 k≥3 에서 끝점이 격자 밖),
phase 가 덮이지 않게 한 걸음을 둘로 나눔(myers-diff · history-bisect), C# 예약어 `base` · `out` 을 IR 이름에서 피함.

호스트가 정한 것: incremental-build 의 "주석만" 칸 파일 줄 `//` 는 지문을 셈하는 **자료**라 `@notation native` 로 둔다 —
조각 코드 표기 규약을 넓히는 것이 아니다.

## 만들기 · 감사

whole-builder 열이 칸 6 으로 흘렀다. 하나 10.0 ~ 14.1 분. 모두 `whole-check` 오류 0. 관성 계측(완제품 열): 평균 0.07 ·
최고 0.14 · 운동 **10/10**.

감사가 잡은 것 가운데 새 꼴 둘:

- **앞 판의 운동이 새 판을 덮어쓴다** — 걸음 0 에서 결론을 걷어도 앞 판의 rAF 운동이 뒤늦게 끝나며 합 글자(92초 · 31초)나
  불투명도를 다시 썼다(`cache-invalidation`). 되감기 뒤 첫 운동이 되감기 전 자리에서 출발했다(`three-way-merge`).
  계약 카드의 "새 판의 걸음 0" 조항에 "도는 운동도 끊는다" 를 더했다.
- **걸음 경계가 `stepMs` 하나뿐** — projector 가 CSS 전이를 기다리지 않아 걸음이 700ms 였다(`branch-coverage`). `sleep(stepMs + motionMs)`.

그 밖에: 편집 목록이 캔버스 아래로 넘침(`myers-diff`, 고친 줄 4 × 파일 길이 10), 설명 글의 틀린 사실
("동률을 어느 쪽으로 풀든 D 는 같다" — 아래로 풀면 D 가 는다, "줄 수를 곱한 칸" — (N+1)(M+1)), 셈하지 않은 결론을 박은 캡션
(`semantic-versioning` 의 "오른쪽 자리는 0 으로" 가 고침 판에도 떴다).

## 개념 메타 — 서브도메인마다 하나

다섯 에이전트가 완제품 열 · 조각 서른셋 = **마흔셋**을 썼다(각 7 ~ 8 분). 셋은 완제품 등록 전에 돌아 덮임 검사를
끝까지 못 돌렸고, 호스트가 등록 뒤 한 번에 확인했다 — 완제품을 먼저 등록하고 개념을 띄웠으면 됐다.
`concept:audit` 기계 판정 통과, definition 겹침 최고 0.38(`branchIsALabel` ↔ `unreachableSnapshot`, 분야 공통어).

## 닫기

typecheck 통과 · 테스트 **2875/2875**(`--maxWorkers=2 --minWorkers=1`) · 고아 0.

호스트 실수 하나: zsh 는 따옴표 없는 `$W` 를 낱말로 나누지 않아 완제품 디렉터리가 빠진 커밋이 생겼다. 푸시 전이라
제 커밋 둘을 되돌려 다시 나눴다. 여러 경로는 변수에 담지 말고 그대로 적는다.

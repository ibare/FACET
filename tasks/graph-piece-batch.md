# 그래프 조각 배치 — 사양 원본

`tasks/piece-batch-protocol.md` 의 절차를 따른 네 번째 배치. 이 문서는 호스트가
에이전트에게 넘긴 사양을 그대로 보존한다 — 나중에 화면과 견주려면 무엇을 시켰는지가
남아 있어야 한다.

## 배치를 정한 근거

그래프 영역에서 이미 있는 것: `adjacencyListVsMatrix`(조각) · `bfs`(완제품) ·
union-find 계열 넷(`findRoot` · `unionByRank` · `pathCompression` 조각 +
`unionFind` 완제품).

**BFS 의 "같은 거리가 한꺼번에 켜진다" 는 조각으로 만들지 않았다.** 그것이 정확히
`bfs` 완제품의 핵심 관찰(`layer-discovered` 집합 이벤트)이라, 조각으로 다시 만들면
완제품의 축소판이 된다 — S-piece 가 이름 붙인 실패 모드다. 대신 완제품이 없는
자리(깊이 우선 · 위상 정렬 · 완화 · 이분성)와 그래프 표현의 기초로 열을 채웠다.

## 1차 열 (2026-09-09)

| 이름 | 주장 | 동사 | stepMs |
| --- | --- | --- | --- |
| `one-way-edge` | 화살이 붙으면 되돌아오는 길이 사라진다 | 끊긴다 | 800 |
| `fewer-hops-not-shorter` | 거치는 정점이 적다고 짧은 길이 아니다 | 역전한다 | 900 |
| `mark-visited-or-loop` | 표시가 없으면 고리를 벗어나지 못한다 | 되밟는다 → 벗어난다 | 650 |
| `queue-vs-stack-order` | 그릇만 바꾸면 방문 순서가 갈린다 | 갈린다 | 750 |
| `dive-then-backtrack` | 막히면 왔던 길을 되짚어 나온다 | 파고든다 / 물러난다 | 700 |
| `separate-components` | 한 번의 탐색은 자기 덩어리 밖으로 못 간다 | 남는다 | 800 |
| `two-color-conflict` | 홀수 고리에서 두 색 칠하기가 부딪힌다 | 부딪힌다 | 850 |
| `indegree-zero-first` | 들어오는 화살이 없는 것만 꺼낼 수 있다 | 떨어져 나온다 | 900 |
| `relax-shorter-path` | 더 짧은 길을 찾으면 적어 둔 수를 내린다 | 내려간다 | 950 |
| `cycle-blocks-order` | 고리에 걸린 것들은 서로를 기다려 멈춘다 | 멈춘다 | 850 |

### 데이터 (구조만. 파생값은 알고리즘이 셈한다)

- **one-way-edge** — 정점 S·A·B·T·C. 무방향 S–A, A–B, B–T, S–C, C–T →
  방향이 붙어 S→A, A→B, B→T, C→S, C→T. 출발 S.
  *대조: 무방향이면 다섯 다 닿고, 화살이 붙으면 넷. C 는 들어오는 화살이 없다.*
- **fewer-hops-not-shorter** — 정점 S·A·T·B·C·D. 무방향 S–A(9), A–T(9), S–B(2),
  B–C(3), C–D(2), D–T(4).
  *대조: 간선 둘에 무게 18, 간선 넷에 무게 11.*
- **mark-visited-or-loop** — 정점 A·B·C·D. 무방향 A–B, B–C, C–A, C–D.
  이웃 순서는 저작 결정이라 못박음 — A:[B] B:[C] C:[A,D] D:[C]. 출발 A.
  *대조: 표시가 없으면 D 에 영영 못 닿는다.*
- **queue-vs-stack-order** — 정점 1..6. 무방향 1–2, 1–3, 2–4, 2–5, 3–6. 이웃은
  번호 오름차순. 출발 1.
  *대조: 큐면 1,2,3,4,5,6 / 스택이면 1,3,6,2,5,4.*
- **dive-then-backtrack** — 정점 A..F. 무방향 A–B, B–D, B–E, A–C, C–F. 이웃은
  알파벳 순. 출발 A.
  *대조: 방문 A,B,D,E,C,F. 되짚어 오르는 일 다섯 번.*
- **separate-components** — 정점 A..H. 무방향 A–B, B–C, A–C, D–E, F–G, G–H.
  *대조: 덩어리 셋(3·2·3). A 에서 한 번 돌면 다섯이 남는다.*
- **two-color-conflict** — 정점 P·Q·R·S·T. 무방향 P–Q, Q–R, R–S, S–T, T–P.
  *대조: 고리 길이 다섯. 마지막 변 T–P 의 두 끝이 같은 색.*
- **indegree-zero-first** — 정점 a..e. 방향 a→c, b→c, c→d, c→e, b→e.
  *대조: 처음 0 인 것은 a·b. 다섯이 모두 나온다.*
- **relax-shorter-path** — 정점 S·A·B·C. 방향 S→A(7), S→B(2), B→A(3), A→C(1),
  B→C(9). 출발 S.
  *대조: A 는 7→5, C 는 11→6. 끝에서 S0 B2 A5 C6.*
- **cycle-blocks-order** — 정점 p..t. 방향 t→p, p→q, q→r, r→q, r→s.
  *대조: 0 인 것은 t 하나. 둘 꺼내고 멈춘다. q↔r 이 서로를 기다린다.*

## 다음 열 후보

최단 경로와 최소 신장 트리 — 가장 가까운 것부터 확정한다 · 음수 간선이 확정을
깬다 · 안정될 때까지 되풀이한다 · 가벼운 것부터 고르되 고리가 되면 버린다 ·
자란 나무에 붙은 것 중 가장 가벼운 것 · 자른 면을 건너는 가장 가벼운 간선.

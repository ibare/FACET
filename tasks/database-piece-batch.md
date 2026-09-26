# 데이터베이스 조각 쉰셋 — 배치 기록

2026-09-25 ~ 26. 데이터베이스 서브도메인 일곱의 미구현 조각 전부를 칸 열로 흘려보냈다. 규범은 `piece-batch-protocol.md` · `piece-contract.md`.
같은 세션에서 완제품까지 닫았다(`database-whole-batch.md`). 개념 메타는 완제품과 **한 묶음으로** 썼다.
worktree `facet-batch3` 에서 다른 worktree 세션 둘과 나란히 돌았다.

## 흐름

```
사양 일곱 (서브도메인마다 하나, 4.3 ~ 8.0 분 · 0.09 ~ 0.12M)
사양이 오는 대로 쪼개 칸 10 에 — nosql → sql → query-processing → relational → indexes → distributed-db → transaction
조각 하나 5.4 ~ 10.1 분 (평균 약 7.8) · 평균 약 0.11M
감사 칸 밖 · 끝나는 대로 하나~셋씩 · 지적은 만든 에이전트에게
서브도메인이 닫히는 대로 등록 · 관성
```

도중에 **세 번 끊겼다** — 세션 비정상 종료 한 번, 사용자가 멈춘 것 두 번. 멈춘 까닭은 여러 세션을 나란히 돌릴 때의 메모리 폭증이었고,
원인(검사기의 vitest 워커 · 고아)을 고친 뒤 재개했다(`piece-batch-protocol.md` "세션을 여럿 나란히 돌릴 때"). 끊긴 에이전트는 모두
`SendMessage` 로 같은 기록 위에서 이어 붙였고 **잃은 파일은 없었다** — 디스크에 남은 것을 확인하고 끊긴 자리부터 이었다.

| 서브도메인 | 조각 | 관성 (최고 유사도 · 좌표 · 어휘 · 운동) |
| --- | --- | --- |
| relational | 9 | 0.21 · 0.43 · 7 · 8/9 |
| sql | 8 | 0.25 · 0.46 · 6 · 8/8 |
| indexes | 7 | 0.17 · 0.42 · 7 · 7/7 |
| query-processing | 5 | 0.15 · 0.35 · 5 · 5/5 |
| transaction | 10 | 0.19 · 0.44 · 6 · 10/10 |
| distributed-db | 10 | 0.16 · 0.37 · 7 · 10/10 |
| nosql | 4 | 0.15 · 0.33 · 8 · 4/4 |

## 사양에서 호스트가 정한 것

- **SQL 은 그 자체가 주장인 소재**라 SQL 을 보이는 조각은 SQL 그대로 쓰고 `@notation native` (SQL) 를 단다. 문서 조각의 JSON 도 같다.
  트랜잭션 연산열은 교과서 표기(`R1(x)` · `W2(y)` · `C1`)
- 표 · 열 · 값 · 노드 이름, SQL, EXPLAIN 연산자 이름(`Seq Scan`), 프로토콜 메시지 이름(`prepare` · `AppendEntries`)은 **번역하지 않는 자료**.
  역할 · 상태(리더 · 임기 · 확정)는 문안
- 모형 전제는 모두 **설명 글**이 밝힌다 — 엄격 모형(표준 SQL), ORDER BY 없는 줄 차례, ANSI 잠금 기반 REPEATABLE READ, 캐시 없는 비용 식,
  줄인 Raft 걸음, 해시 범위는 버킷을 전부 연다
- 설명 글의 걸음 수는 **처음 화면(걸음 0)을 넣어** 센다 — 감사가 이를 달리 읽어 한 번 지적했고 기각했다 → 계약 카드에 넣음

## 감사가 잡은 것

조각 쉰셋 가운데 **서른이 위반 0**(권고만 있거나 없음). 지적 · 권고는 모두 만든 에이전트가 고쳤다. 되풀이된 꼴:

| 꼴 | 조각 |
| --- | --- |
| 캡션 · description 에 셈하지 않은 결론 ("합은 같다" · "조건 통과" · "칸마다 값 하나" · "열쇠가 아니다" · "리더는 그대로다" · "팔로워에는 아직 없다" · "끝 답은 그대로다") | column-oriented · plan-is-a-tree · atomic-cell · determinant-must-be-key · partial-dependency · elect-a-leader · replication-lag · reorder-joins · index-costs-write |
| 무대가 알고리즘의 셈을 다시 함 (합 · 잘림 · 겹침 자리 · 사본 수 · 매듭 수) | same-answer-different-plan · window-slides · transitive-dependency · split-brain |
| 조용히 지나침 · 지어냄 (`?? 0` · `''` · `continue` · 모르는 이벤트 `return scene`) (C6) | insert-update-delete · bad-estimate-bad-plan · partition-forces-choice · group-then-aggregate · durable-after-commit 외 권고 다수 |
| 캡션이 세는 수가 멈춘 화면에 안 보임 · 화면과 다른 사실 | grow-then-shrink · split-brain(처음부터 확정된 칸을 뺌) · keep-old-version(설명 글의 정의) |
| 다크에서 `accent` 위 글자가 사라짐 | keep-old-version |

## 에이전트가 짚은 것

- 밝은 테마의 `success` 가 `primary` · 글자색과 같은 먹색 — **다섯이 따로** 짚었다(운영체제 배치에 이어 둘째) → 계약 카드에 우회를 넣음.
  토큰 층 결정이라 이 배치에서 고치지 않았다
- 인스턴스마다 다른 `clipPath` id 가 흘림/곧바로 글자 대조에 걸림(window-slides) → 계약 카드에 넣음
- `facet-shot` 글자 요약이 줄마다 약 200 자에서 잘림 · `--settle` 기본이 긴 운동보다 짧음 → 완제품 카드에 넣음

## 계기

```
관성        일곱 서브도메인 모두 PASS
piece-check 쉰셋 모두 오류 0 · 경고 0
scene-audit 쉰셋 모두 흔들림 0 · 왕복어긋남 0 · 완주못함 0 (worktree 에서 제 vite 5191, 모든 편집이 끝난 뒤)
```

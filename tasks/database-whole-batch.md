# 데이터베이스 완제품 스물 — 배치 기록

2026-09-26. 조각 쉰셋(`database-piece-batch.md`)과 같은 세션에서 분야를 완제품까지 닫았다. 규범은 `whole-batch-protocol.md` ·
`whole-contract.md` · `concept-meta-batch-protocol.md`. 운영체제에 이어 **분야를 한 세션에 끝까지 닫은** 셋째 배치다.

## 판정 — 서른넷에서 스물

판정 에이전트 하나가 잣대 셋을 매기고 손잡이를 `judge-sim.py` 로 돌렸다. 조각 사양이 다 서자마자 띄워 조각 배치와 나란히 돌렸다
(운영체제 배치는 조각을 닫은 뒤 띄웠다). table-key 는 완제품(`relational-tables-and-keys`)이 이미 있다.

| 완제품 (디렉터리) | host 토픽 → 넓힌 이름 | 합친 토픽 · 옮긴 조각 | 손잡이 | IR |
| --- | --- | --- | --- | --- |
| normal-forms | 1nf → "정규화 단계" | 2nf · 3nf · bcnf | 단계 UNF..BCNF × 고칠 사실 | 둠 |
| dml | dml | ddl(버림) → schema-defines-shape | 문 차례 여섯 | 둠 |
| join-kinds | inner-join → "조인 종류" | outer-join · cross-join | 종류 다섯 | 둠 |
| subquery | subquery | — | 비상관/상관 × 줄 수 | 둠 |
| window-function | window-function → "집계 — 접기와 남기기" | group-then-aggregate(dml 에서) | 틀 0/1/2/UNBOUNDED | 둠 |
| index-choice | b-plus-tree → "인덱스와 질의 꼴" | hash-index | 인덱스 × 질의 | 둠 |
| bitmap-index | bitmap-index | — | AND/OR × 조건 수 | 둠 |
| composite-index | composite-index | — | 열 차례 × 질의 | 둠 |
| optimizer | optimizer → "조인 차례와 실행 계획" | execution-plan | 거른 고객 × 조인 차례 | 둠 |
| cost-model | cost-model | — | 통 수 × 범위 | 둠 |
| column-family | column-family | — | 칸 묶음 × 묻는 칸 | 둠 |
| acid | acid | — | 커밋 방식 × 끊는 틱 | 둠 |
| isolation | isolation-level → "격리 수준과 잠금" | lock · two-pl | 격리 수준 | 없음 |
| mvcc | mvcc | — | 스냅샷 × 읽는 이 시작 틱 | 둠 |
| replication | replication → "복제와 CAP" | cap | 기다릴 팔로워 × 갈라짐 | 둠 |
| sharding | sharding | — | 해시/구간 × 샤드 수 | 둠 |
| raft | raft | — | 노드 수 × 멈춘 수 | 둠 |
| paxos | paxos | — | 끼어드는 때 × 약속 받는 곳 | 둠 |
| document-kv | document-db → "문서와 키-값" | kv-db | 담는 법 × 질의 | 없음 |
| graph-db | graph-db | — | 홉 × 담는 법 | 둠 |

**버림 셋** — relation(뒤섞어도 겹쳐도 수가 그대로라 조각을 되풀이할 뿐 — 조각 둘은 table-key 로) · ddl(세 칸 모두 약함) · parsing(조각이 없고 세 칸 모두 약함).

**사용자가 정한 것** — 판정서대로(합침 열하나 · 버림 셋, 카탈로그에서 지우고 조각 origin 열여섯을 host 로 옮김). acid 는 "끊는 자리" 만 돌리면
os/journaling 의 되풀이라 **커밋 방식(로그를 언제 내리는가)** 을 주 손잡이로. isolation 은 하나로(조각 여섯을 잇는다). 카탈로그 규모 1044 → 1030.

## 흐름

```
판정 1 (조각 사양이 선 뒤 곧바로, 칸 밖) → 사용자 확인 → 사양 넷 (13.3 ~ 15.9 분 · 0.21 ~ 0.24M, 조각 배치와 나란히)
조각 대기열이 비는 대로 칸에 — 한때 조각 하나 + 완제품 아홉
완제품 하나 9.3 ~ 14.6 분 (평균 약 12) · 평균 약 0.15M
감사 칸 밖 · 하나씩 · 지적은 만든 에이전트에게
등록 한 번 (--topic 다섯) · 관성 · 개념 메타 여섯(묶음마다)
```

사양 에이전트가 판정서에서 바꾼 자리를 모두 받아들였다 — 다섯 묶음 모두 조각 자료를 쓰지 않고 새로 짬(완제품이 조각 장면을
되풀이하지 않게), window 를 `window-function` 으로 개명(일반어), acid 에 "모아 내림" 을 더함, column-family 에 "칸 묶음" 손잡이를 더함,
replication 에 거절 규칙(닿는 팔로워가 모자라면 적지 않는다)을 정함.

## 감사가 잡은 것

스물 가운데 **셋이 위반 0**(subquery · sharding · dml 은 권고만), 나머지는 지적 · 권고를 만든 에이전트가 고쳤다. 가장 많이 되풀이된 꼴 둘:

| 꼴 | 완제품 |
| --- | --- |
| **새 판의 걸음 0 에 앞 판의 결론이 남음** — 값 글자 · "가장 쌈" 표지 · OK/거절 글자 · 스냅샷 선 · 코드 패널 강조가 새 손잡이 값과 다른 말을 한다 | index-choice · optimizer · cost-model · column-family · acid · mvcc · replication · raft · document-kv (서로 못 본 채 아홉) |
| 무대가 알고리즘의 셈을 다시 함 · 없는 값을 지어냄 (C6) | cost-model(맞음 여부) · document-kv(합) · graph-db · normal-forms · index-choice · isolation · optimizer |

그 밖: 셈하지 않은 description("두 조인 차례는 같은 답" · "~만 바뀐다"), 호스트가 뺀 계기(acid 의 `half-txs`)를 그대로 둠, 설명 글과 화면 어긋남
(join-kinds 의 "제자리를 지킨다"), en 캡션의 수가 문장 한가운데("reaches 1 rows"), 표지 겹침(isolation).

**첫 꼴은 계약 카드에 넣었다** — "새 판의 걸음 0 에 앞 판의 결론을 남기지 않는다(자리는 남겨도 된다)". 운동을 "앞 판에서 옮겨 간다" 로
적어 둔 카드가 오히려 결론까지 남기게 부추겼다.

## 검사기에서 걸린 것

- **`whole-self-check` 가 손잡이를 하나씩만 돌렸다** — replication 의 `refuse` phase 는 갈라짐 있음 × 기다릴 수 ≥ 2 에서만 켜져 "끝내 안 켜지는
  줄" 로 잘못 잡혔다. 손잡이가 둘 이상이고 칸이 40 이하면 조합을 모두 거치도록 넓혔다. 기존 완제품 스물은 그대로 통과한다
- 계약 카드의 `IRType` 표기(`int` 문자열)가 실제 타입(`{ kind: 'int' }`)과 달랐다 → 카드 고침
- `facet-shot` 의 `--input` 이 `{ value }` 만 싣는 것 · `--settle` 기본이 긴 운동보다 짧은 것 · 글자 요약 200 자 잘림 → 카드에 넣음

## 계기

```
관성        최고 0.19 · 좌표 0.36 · 어휘 8 · 운동 20/20   PASS
whole-check 스물 모두 오류 0 · 경고 0
개념 감사   기계 판정 통과 (미선언 참조 0 · 빈 자리 0 — 어휘 후보 5 건은 기존 개념의 것)
전수        typecheck PASS · test 2540/2540
```

## 개념 메타

묶음 여섯(관계 모델 · SQL · 읽기 경로 · 트랜잭션 · 분산 · NoSQL)마다 에이전트 하나가 **완제품과 조각을 함께** 썼다 — 일흔셋(새 73 + 기존
relational-tables-and-keys 에 조각 넷 잇기). 서로 아직 없는 개념을 `contrastWith` 로 가리켜 한동안 덮임 검사가 모듈을 못 읽었다 — 마지막 묶음이
들어오며 풀렸다. definition 낱말 겹침 최고 0.38(copy-to-followers ↔ replication-lag), 완제품 ↔ 조각 최고 0.32(raft ↔ majority-decides).

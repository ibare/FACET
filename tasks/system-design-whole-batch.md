# 시스템 설계 완제품 열셋 — 배치 기록

2026-09-26. 조각 서른다섯(`system-design-piece-batch.md`)을 만드는 동안 구현 안 된 origin 토픽 열일곱을 판정했고, 조각이 닫히는
대로 완제품과 개념 메타까지 같은 세션에서 닫았다. 이 분야의 완제품 셋(`lru-cache` · `caching-cdn` · `messaging-pubsub`)은 이미 있었다.

## 판정 — 열일곱에서 열셋(합침 둘 · 버림 둘)

판정 에이전트 하나(18.8 분 · 0.28M)가 잣대 셋(`whole-batch-protocol.md`)을 매기고 `judge-sim.py` 로 손잡이를 실측했다.
사용자가 판정 그대로 확정했고, 버린 토픽의 조각은 **가까운 완제품으로 origin 을 옮기기**로 정했다(개발 도구 배치는 그대로 두었다).

| 완제품 | 흡수한 토픽 | 손잡이 |
| --- | --- | --- |
| lfu-cache | — | 세는 창 |
| cache-coherence | — | 알리는 법 × 잇단 쓰기 |
| kafka-pattern | — | 보존 길이 × 느린 그룹 간격 |
| round-robin-lb "로드 밸런싱" | least-connection · consistent-hashing | 고르는 법 × 걸림 들쭉날쭉 |
| queueing-model | — | 들쭉날쭉 × 부하 ρ |
| rate-limiting | — | 제한 방식 × 몰림 허용 b |
| backpressure | — | 넘칠 때 × 보내는 빠르기 |
| retry-and-backoff | — | 다시 오는 법 × 장애 길이 |
| bulkhead | — | a 칸 크기 |
| consistency-model | (조각 agree-on-one-value 를 옮겨 옴) | 퍼뜨림 수 × 읽기 규칙 |
| clock-sync | — | 빠르기 배수 × 다시 맞춤 주기 |
| service-discovery | (조각 one-door-many-rooms 를 옮겨 옴) | 만료 길이 |
| circuit-breaker | — | 문턱 × 열림 기다림 |

열셋 모두 IR 을 둔다(해시는 IR 밖에서 셈해 넘긴다).

**합침**: consistent-hashing 은 제 손잡이(가상 노드 · 서버 수)가 화면 크기의 키에서 단조로 서지 않았다 — 단조로 서는 것은 나머지 대 링의
견줌뿐이라 방식 하나로 합쳤다. least-connection 은 제 손잡이가 없다.
**버림**: `consensus`(노드 수 · 끼어드는 때 손잡이가 database 의 raft · paxos 표를 되풀이) · `api-gateway`(세 잣대 모두 약함).
**카탈로그** (커밋 `c018c5b6`): 네 항목 삭제, origin 다섯 옮김, host 개명. `catalog-integrity` 하한 990 → 986.

## 사양 — 셋으로 나눠 병행

| 묶음 | 완제품 | 시간 |
| --- | --- | --- |
| 사본과 기록 | lfu-cache · cache-coherence · kafka-pattern · consistency-model · clock-sync | 18.3 분 · 0.28M |
| 부하가 흐르는 길 | round-robin-lb · queueing-model · rate-limiting · backpressure | 17.1 분 · 0.29M |
| 실패를 견디는 법 | retry-and-backoff · bulkhead · circuit-breaker · service-discovery | 15.2 분 · 0.25M |

사양 에이전트가 판정에서 고친 것: 확신 낮던 둘을 다시 실측했다 — lfu-cache 가운데 봉우리는 씨앗 200 중 194 에서 섰고, consistency-model 은
짝 표를 손잡이와 무관하게 한 번만 뽑자 단조가 원리상 섰다. 흩음의 뽑기를 판 머리에 미리 뽑아 손잡이를 돌려도 같은 뽑기 열을 쓰게 했다(retry-and-backoff).
circuit-breaker 의 "살아난 뒤 닫힘까지" 는 톱니라 방향을 말하지 않고 범위만 말한다.

호스트가 덧붙인 것: **걸음 경계는 운동이 끝난 뒤** — `sleep(stepMs + motionMs)`. 걸음이 서른을 넘는 완제품(lfu-cache 60 · queueing-model 42)은
판 길이 20 초를 넘어도 된다고 했다.

## 만들기 · 감사

whole-builder 가 조각과 같은 칸 여섯에 번갈아 흘렀다. 하나 10.6 ~ 15.0 분. 모두 `whole-check` 오류 0.
관성 계측(완제품 열셋): 평균 **0.08** · 최고 **0.12** · 운동 **13/13**.

감사가 잡은 것 가운데 새 꼴:

- **판 머리 silent init 뒤 걸음 경계가 없다** — 열셋 중 **넷**(`queueing-model` 은 High, `kafka-pattern` High, `clock-sync` Medium, `backpressure` 권고).
  손잡이 운동을 silent init 이 시작하는데 reactive `emit` 은 기다리지 않아 곧장 나간 첫 걸음이 그 운동을 끝 자리로 붙인다. `whole-check` 도
  facet-shot 도 못 잡고 감사만 잡았다. 첫 감사에서 잡힌 뒤 감사 틀에 한 줄을 더했더니 뒤 감사들이 같은 자리를 찾아냈다. 계약 카드 운동 절에 올렸다.
- **IR 의 `max(0, 실수)`** — C++ 로 `std::max(0, double)` 이 되어 컴파일되지 않는다(`queueing-model` 이 스스로 찾아 `if` 로 풀었다). 계약 카드 IR 절에 올렸다.
- **앞 판 자국이 두 판 전 것** — lfu-cache 는 앞 판이 "끝까지 남음" 이면 점선 자리를 덮어쓰지 않아 두 판 전 자리에서 출발했다.
- **description · 설명 글이 사다리 전체에 단정** — kafka-pattern("보존이 길수록 잃음은 줄고"), lfu-cache("창이 짧을수록 동률이 잦고"), clock-sync
  ("뚝 떨어진다" — 빠르기가 음수인 시계는 위로 뛴다). 카드에 이미 있는 조항인데 셋이 걸렸다.

**검사기 오탐**: `whole-check` 의 C10 경고(`label: { en: '5…'`)가 손잡이 구간이 아닌 계기 라벨 `'503'` 에도 걸렸다 — 감사가 판정하고 호스트가
검사를 `segments` 블록 안으로 좁혔다.

## 호스트 실수

**완제품 공통 안내문에 조각 규약을 옮겼다.** 조각 사양 안내문의 "장면 · 무대의 `initial` 도 같은 좁히개를 부른다" 를 완제품 안내문에도 넣었다.
완제품 무대는 View 라 원칙 1 로 algorithm 을 부를 수 없다 — bulkhead · service-discovery · round-robin-lb · rate-limiting 넷이 보고에 그 충돌을 적고
원칙을 따랐고, 호스트는 남은 두 묶음 안내문에 정정 줄을 넣었다. `whole-batch-protocol.md` 절차 5 에 조항으로 남겼다.

## 개념 메타 — 묶음 일곱

일곱 에이전트가 완제품 열셋 · 조각 서른다섯 = **마흔여덟**을 썼다(각 5.9 ~ 7.6 분). 완제품을 먼저 등록하고 띄웠다(딥러닝 배치 조항).
이미 있는 완제품 셋의 개념은 고치지 않고 그 아래 조각만 이었다. 앞서 끝난 묶음은 다른 묶음의 미선언 참조 때문에 덮임 검사를 끝까지
못 돌렸고 뒤 묶음이 등록한 뒤 풀렸다 — 마지막 묶음이 전체를 한 번 돌려 통과했다.
`concept:audit` 기계 판정 통과(어휘 후보 22 건은 모두 이전 분야 개념), definition 겹침 묶음 안 최고 0.33(`circuitBreaker` ↔ `tripAfterFailures`, 장치 이름),
이웃 분야와 0.27(`agreeOnOneValue` ↔ `paxos`, `jitteredBackoff` ↔ `collisionAndBackoff` — `contrastWith` 로 이었다).

## 닫기

typecheck 통과 · 테스트 **3466/3466**(`--maxWorkers=2 --minWorkers=1`, 321 초) · scene-audit 35/35 · 고아 0.

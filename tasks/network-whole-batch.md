# 컴퓨터 네트워크 완제품 열셋 — 배치 기록

2026-09-25. 같은 날 조각 서른아홉(`network-piece-batch.md`)을 닫은 뒤 이어서 분야를 완제품까지 닫았다. 규범은 `whole-batch-protocol.md` ·
`whole-contract.md` · `concept-meta-batch-protocol.md`. 운영체제에 이어 **분야를 한 세션에 끝까지 닫은** 셋째 배치다(중간에 세션이 한 번 끊겼다).

## 판정 — 스물다섯에서 열셋

판정 에이전트 하나가 잣대 셋을 매기고 손잡이를 `judge-sim.py` 로 돌렸다(조각 사양의 대조값을 같은 코드로 먼저 재현한 뒤). ip-routing 은 완제품이 이미 있다.

| 완제품 (디렉터리) | 넓힌 이름 | 합친 토픽 · 옮긴 조각 | 손잡이 | IR |
| --- | --- | --- | --- | --- |
| physical-layer | 부호와 틀 | datalink-layer → frame-boundary | 부호 × 실을 데이터 | 둠 |
| network-layer | 캡슐화와 홉 전달 | (application-layer 버림) · smtp 버림 → store-and-forward | 쪼갠 수 × 링크 수 | 둠 |
| ethernet | CSMA/CD | — | 스테이션 수 × 물러나기 × 씨앗 | 둠 |
| arp | ARP 와 MAC 주소 | mac → mac-is-local | 목적지 망 × 캐시 | 둠 |
| rip | 라우팅 프로토콜 | ospf · bgp → link-state-flood · shortest-path-tree · path-vector-policy | 방식 넷 × 끊는 선 | 없음 |
| nat | (그대로) | — | 바꾸는 칸 × 찾는 열쇠 × 기기 수 | 둠 |
| firewall | (그대로) | — | 차단 줄의 자리 | 둠 |
| ip-routing (있음) | (그대로) | icmp → echo-and-reply · ttl-expired-reports | (이번에 고치지 않음) | — |
| tcp-handshake | TCP 와 UDP | udp · transport-layer → send-and-forget · port-demultiplex · ftp 버림 → control-and-data-channel | 방식 × 잃는 수 | 둠 |
| congestion-control | 흐름 제어와 혼잡 제어 | flow-control → receiver-window | 앱이 읽는 양 × 망 용량 | 둠 |
| http | HTTP 와 웹소켓 | websocket → upgrade-then-keep-open | 폴링 간격 / 웹소켓 | 둠 |
| dns | (그대로) | — | TTL | 둠 |
| tls-handshake | (그대로) | — | 가운데 사람 × 인증서 확인 | 둠 |
| auth | (그대로) | — | 토큰 수명 | 없음 |

**버림 셋** — application-layer(조각도 손잡이도 없다) · smtp(갈리는 것은 재시도 간격뿐이라 retry-and-backoff 의 말) · ftp(짐 길 = 파일 + 1, 직선).

**사용자가 정한 것** — 판정대로. 합친 아홉 · 버린 셋은 카탈로그에서 지우고 조각 origin 열셋을 host 로 옮겼다. host 이름 여덟을 넓혔다(id 는 그대로 —
운영체제 fcfs 와 같은 처리). 카탈로그 규모 1044 → 1032.

**계층 토픽을 어떻게 갈랐나** — osi-tcp 의 다섯 계층 토픽은 뒤 서브도메인과 같은 것을 다른 높이에서 말한다. 물리 · 데이터 링크는 "부호와 틀" 하나로,
네트워크 계층은 캡슐화 · 홉 전달의 완제품으로 서고, 전송 계층은 tcp-handshake 에, 응용 계층은 버렸다.
**flow-control 을 congestion-control 에 합친 까닭** — 지시문은 "제 손잡이가 있으면 따로" 였지만, 합친 판에서 두 손잡이가 다 살고 "둘 중 작은 쪽이 조인다" 가
새 주장이 된다. 실측에서 넘어가는 자리가 용량 따라 옮겼다(용량 8: 읽는 양 4 와 6 사이 · 12: 8 과 12 사이).

## 흐름

```
판정 1 → 사용자 확인 → 사양 넷 (12.2 ~ 13.6 분 · 0.22 ~ 0.24M)
사양이 오는 대로 whole-builder 를 칸 10 에 — 셋은 대기열
완제품 하나 10.0 ~ 15.9 분 (평균 12.3) · 평균 0.15M
감사 칸 밖 · 지적은 만든 에이전트에게
카탈로그 정리 (토픽 12 지움 · origin 13 옮김 · 이름 8) · 등록 한 번 · 관성 · 개념 메타 넷(묶음마다)
typecheck · test · scene-audit
```

사양 에이전트가 판정서에서 바꾼 자리를 모두 받아들였다 — TCP 기한을 "확인 안 된 가장 앞 조각 하나에만" · 혼잡 문턱 16 → 4(느린 앱 판의 잃음 1 을 없앰) ·
rip 알림 셈 규약 하나로 통일(판정서는 방식마다 셈법이 달랐다) · ethernet 에 씨앗 손잡이(한 씨앗만 보이면 버림이 우연처럼 읽힘) · dns 원본 바뀜 100 → 125 초
(TTL 30~120 에서 평평하던 옛 답이 단조로) · tls 에 서버 서명 자료.

## 감사가 잡은 것

열셋 가운데 **넷이 위반 0**(dns · ethernet · nat · arp — dns 말고는 권고만). 지적은 모두 만든 에이전트가 고쳤다.

| 완제품 | 지적 |
| --- | --- |
| physical-layer | 틀이 닫히는 걸음에 칩이 "열리기 전" 으로 켜짐 · 캡션의 부호 이름이 한 걸음 동안 앞 판 선과 어긋남 |
| network-layer | 라우터 층 표지에 물리 칸이 빠져 "라우터엔 물리 층이 없다" 로 읽힘 |
| rip | 설명 글 "두 라운드 만에 멈춘다"(실제 넷) · 캡션 "16" 을 글자로 · stage 가 닿을 수 없음 판정을 셈 · 모르는 라우터를 소리 없이 넘김(C6) |
| congestion-control · tls-handshake | 설명 글이 특정 손잡이 값에서만 맞는 서술을 일반으로 |
| http · firewall · tcp-handshake · auth | stage 가 빈 자료를 `''` · `[]` 로 지어냄(C6) — 넷이 같은 자리 |
| arp | (위반 아님 판정 · 호스트 결정) IR 이 답만 같고 셈이 달랐다 — 아래 |

## 에이전트가 짚은 것

- **IR 이 답만 같고 셈이 다른 것** — arp 의 IR 이 라우터 배열을 차례로 훑고 `gateway` 인자를 읽지 않았다. 네 조합의 답이 같아 `whole-check` 가 통과했고
  감사가 "배열을 뒤집으면 어긋난다" 로 잡았다. 원인은 사양 IR 절. 호스트가 사슬 셈으로 고치게 했다 → **프로토콜 "코드 패널은 화면과 같은 답" 절에 넣음**
- **자체 검증이 손잡이를 하나씩만 돌린다** — tls-handshake 의 `sign-ok` 가 손잡이 둘의 곱에서만 닿아 사양 기본값으로는 "끝내 안 켜지는 줄" 로 잡혔다.
  기본값을 옮겨 우회 → **프로토콜에 넣음**(검사기는 아직 안 고쳤다)
- projector 를 `if` 사슬로 쓰면 `case 'phase'` 글자 검사가 C3 로 잡는다 — 셋이 걸려 `switch` 로 → **카드에 넣음**
- stage 문안 조회기 `tx` 가 en-original 검사를 원인 없이 실패시킴 — 조각 카드에만 있던 줄 → **완제품 카드에도 넣음**
- IR 매개변수 `out` 이 C# 예약어 — 카드에 이미 있었는데 사양이 그 이름을 썼다
- 완제품 캔버스 폭은 규약이 없다(620 은 조각만) — rip 이 780 을 쓰고 감사가 통과시켰다

## 계기

```
관성        최고 0.14 · 좌표 0.33 · 어휘 7 · 운동 13/13   PASS
whole-check 열셋 모두 오류 0 · 경고 0
개념 감사   기계 판정 통과 (미선언 참조 0 · 빈 자리 0) — 새 개념 쉰둘 · 고친 것 ip-routing 하나
전수        typecheck PASS · test 2468/2468
scene-audit 조각 서른아홉 — 흔들림 0 · 왕복어긋남 0 · 완주못함 0 (워크트리 playground 를 5191 에 띄워서. 9336 은 앞선
            감사가 남긴 고아 Chrome 이 쥐고 있어 디버깅 포트만 바꾼 사본으로 돌렸다)
```

## 개념 메타

묶음 넷(선과 링크 · 라우팅과 경계 · 전송 · 응용과 보안)마다 에이전트 하나가 **완제품과 조각을 함께** 썼다. 기존 `ip-routing` 은 조각 넷을 잇고 ICMP 낱말을 더했다.
스키마에 `aliases` 가 없어 합친 토픽의 낱말(OSPF · BGP · UDP · WebSocket · MAC · ICMP)은 host 개념의 `exemplarKeywords` 가 품는다.

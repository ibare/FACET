# 컴퓨터 네트워크 조각 서른아홉 — 배치 기록

2026-09-25. 컴퓨터 네트워크 서브도메인 여섯의 미구현 조각 전부를 칸 열로 흘려보냈다. 규범은 `piece-batch-protocol.md` · `piece-contract.md`.
같은 세션에서 완제품까지 닫았다(`network-whole-batch.md`). 개념 메타는 완제품과 **한 묶음으로** 썼다. worktree(`facet-batch1`)에서 돌렸다.

## 흐름

```
사양 여섯 (서브도메인마다 하나, 4.6 ~ 8.9 분 · 0.09 ~ 0.13M) — 도착하는 대로 쪼개 칸 10 에
조각 하나 5.1 ~ 9.1 분 (끊기지 않은 것 기준) · 평균 0.10M
감사 칸 밖 · 끝나는 대로 하나~셋씩 · 지적은 만든 에이전트에게
서브도메인이 닫히는 대로 등록 · 관성 (osi-tcp · data-link · transport → network-security → application → network-routing)
```

**중간에 호스트 세션이 비정상 종료됐다.** 도는 조각 열 · 고침 둘 · 판정 하나가 멈췄고, 새 세션에서 `state.md` 의 에이전트 id 로
`SendMessage` 를 보내 모두 이어 마쳤다(파일 손실 0). 절차는 `piece-batch-protocol.md` "호스트 상태" 에 넣었다.

| 서브도메인 | 조각 | 관성 (최고 유사도 · 좌표 · 어휘 · 운동) |
| --- | --- | --- |
| osi-tcp | 6 | 0.20 · 0.32 · 7 · 6/6 |
| data-link | 4 | 0.12 · 0.22 · 7 · 4/4 |
| transport | 7 | 0.17 · 0.41 · 7 · 7/7 |
| network-security | 4 | 0.10 · 0.23 · 6 · 4/4 |
| application | 7 | 0.17 · 0.37 · 7 · 5/7 |
| network-routing | 11 | 0.18 · 0.38 · 7 · 11/11 |

## 사양에서 호스트가 정한 것

- 주소 · 도메인 · 포트 · 프로토콜 글자(요청 줄 · 상태 코드 · 머리줄 · SMTP 응답)는 **번역하지 않는 자료**다 — 운영체제 배치의 파일 이름과 같은 처리.
  역할 이름(라우터 · 송신자 · 서버)만 문안
- 무작위(백오프 k · 시퀀스 초깃값 · DH 비밀 수)는 사양이 값을 정해 주고 설명 글이 "예로 정한 값" 을 밝힌다
- network-security 셋에 "호스트 결정" 을 사양 끝에 덧붙였다 — certificate-chain 은 서명 셈식을 화면에 올리지 않음(맞음/어긋남만) ·
  token-bearer 는 만료 두 걸음을 뺌(둘째 주장) · rule-match-order 는 특정 도구의 명령 글자 금지. 감사 지시문에도 "호스트 결정이 본문보다 앞선다" 를 넣었다
- 루트 DNS 서버의 실제 이름(`a.root-servers.net`)은 공개 기반 시설 이름이라 그대로 두었다(주소만 문서용 대역)
- back-off-on-loss 는 카탈로그 이름("혼잡 회피")보다 desc("잃으면 줄인다")를 따랐다 — 덧셈 증가는 끝 걸음에만

## 감사가 잡은 것

조각 서른아홉 가운데 **서른둘이 위반 0**(그중 열여덟은 권고도 0), 지적이 난 것 일곱. 지적 · 권고는 모두 만든 에이전트가 고쳤다. 되풀이된 꼴:

| 꼴 | 조각 |
| --- | --- |
| 캡션에 셈하지 않은 수 · 결론 ("둘씩 쥐고 있다" · "둘 다 빈 선에서 시작" · "둘 다 16" · "나머지 모두에게 퍼진다" · 연 층과 쓴 층에 같은 자리 표시자) | three-way-sync · collision-and-backoff · count-to-infinity · ask-who-has · peer-layer-talk |
| 설명 글의 수 · 서술이 화면과 어긋남 (걸음 열 대 열하나 · 없는 고리 · "다섯 라우터" · 주황 테두리 대 노란 바탕) | delegate-down-the-tree · link-state-flood · hop-count-metric · rule-match-order |
| 파생값을 stage 가 셈함 (`toFixed` 몫 · 프레임 수 더하기) | layer-wraps-payload · ask-who-has |
| 조용히 지나침 · 지어냄 (장면 `initial` 의 `''` · 대체값 1 · `default: return scene`) (C6) | control-and-data-channel(지적) · send-and-forget · slow-start · stateless-needs-token · upgrade-then-keep-open · port-demultiplex |
| 전제를 캡션에 ("높은 자리부터") | bits-as-signal |
| 캡션이 세는 것이 끝 화면에 남지 않음 (운동 중에만 보인 ACK 22) | back-off-on-loss |

## 에이전트가 짚은 것

- **밝은 · 어두운 테마 모두 `success` = `text`** — 조각 다섯 · 완제품 둘이 따로 짚었다(허용이 검정, 완료 테두리가 안 보임) → **두 카드 팔레트 줄에 넣음**
- **`--static` 은 tsc 를 건너뛴다** — 인자를 빠뜨린 호출이 화면에서야 드러났다(forwarding-table) → **조각 카드에 넣음**
- `check-lib` 의 색 리터럴 검사가 주문 번호 `'#1042'` 를 색으로 잡았다 — stateless-needs-token 이 자료를 `#` 와 `1042` 로 갈라 우회. **검사식은 이 배치에서 고치지 않았다**
- 설명 글 서식을 보려고 `ls -t` 로 최근 글을 연 에이전트가 **지금 만들어지는 형제 조각의 글**을 봤다 → 공통 안내문에 덧붙임
- 장면 `initial` 의 빈 값 떨어짐(`Array.isArray(x) ? x : []`)은 저장소 장면 334 중 82 의 관행이라 한 감사는 위반 아님으로, 다른 감사는 권고로 올렸다 —
  **판정이 갈린다.** `S-scene` 에 조항이 없어서다. 조항 후보로 남긴다

## 계기

```
관성        여섯 서브도메인 모두 PASS
piece-check 서른아홉 모두 오류 0
scene-audit 서른아홉 모두 흔들림 0 · 왕복어긋남 0 · 완주못함 0
전수        (network-whole-batch.md 의 계기 절)
```

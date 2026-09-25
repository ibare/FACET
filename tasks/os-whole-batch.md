# 운영체제 완제품 열여섯 — 배치 기록

2026-09-25. 같은 날 조각 쉰넷(`os-piece-batch.md`)을 닫은 뒤 이어서 분야를 완제품까지 닫았다. 규범은 `whole-batch-protocol.md` ·
`whole-contract.md` · `concept-meta-batch-protocol.md`. 프로그래밍 기초에 이어 **분야를 한 세션에 끝까지 닫은** 둘째 배치다.

## 판정 — 스물여섯에서 열여섯

판정 에이전트 하나(10.2 분)가 잣대 셋을 매기고 손잡이를 `judge-sim.py` 로 돌렸다. context-switch 는 완제품이 이미 있다.

| 완제품 (디렉터리) | host 토픽 | 합친 토픽 · 옮긴 조각 | 손잡이 | IR |
| --- | --- | --- | --- | --- |
| process-state | process-state | pcb(버림) → pcb-holds-state | 프로세스 수 1..5 | 둠 |
| scheduling-policy | fcfs → "CPU 스케줄 정책" | sjf · mlfq | 정책 FCFS/SJF/SRTF/MLFQ × 일감 둘 | 둠 |
| round-robin-quantum | round-robin | — | 몫 1..5 × 바꾸는 틱 0·1 | 둠 |
| priority-aging | priority | — | 에이징 간격 없음..1 | 둠 |
| weighted-fair-share | cfs | — | B 의 무게 × C 의 출발 | 둠 |
| mutex | mutex | — | 돌림 몫 × 자물쇠 | 없음 |
| deadlock | deadlock | — | 돌림 몫 × 사이 일 × 잠금 순서 | 없음 |
| producer-consumer | producer-consumer | semaphore · monitor(버림) → wait-and-signal | 칸 수 | 없음 |
| paging | paging | — | TLB 칸 0..4 | 둠 |
| segmentation | segmentation | — | 배치 규칙 × 셋째로 나감 | 둠 |
| virtual-memory | virtual-memory | — | 프로세스 수 × 작업 집합 | 없음 |
| page-replacement | lru → "페이지 교체" | fifo-page · clock-algorithm | 정책 × 프레임 × 참조열 | 둠 |
| file-block-placement | inode → "파일 블록 배치" | fat · directory-structure(버림) → 경로 조각 둘 | 몇 번째 블록 | 둠 |
| journaling | journaling | — | 끊기기 전 쓰기 수 | 둠 |
| disk-scheduling | disk-scheduling | — | 정책 × 팔 시작 | 둠 |
| io-transfer-modes | interrupt → "입출력 방식" | dma | 낱말 수 × 장치 빠르기 | 없음 |

**버림 셋** — pcb(돌려도 표가 길어질 뿐 갈리는 읽기가 없다) · monitor(if/while 이 한 차례에서만 갈려 조각을 되풀이한다) ·
directory-structure(경로 깊이는 읽기 수와 같은 직선 하나).

**사용자가 정한 것** — 합친 일곱 · 버린 셋은 카탈로그에서 지우고 조각 origin 을 host 로 옮긴다(프로그래밍 기초와 같은 처리 — origin
열셋이 옮겨졌다). host 이름을 넓힌다. 카탈로그 규모 1054 → 1044.

**스케줄 · 교체를 정책 손잡이로 합친 까닭** — 정책을 돌리는 것 자체가 주장(무엇이 옮겨 가는가)이 된다. round-robin · priority · cfs 는
그 정책만의 손잡이(몫 · 간격 · 무게)가 단조로 갈려 따로 섰다. 합친 판에서 예상 밖으로 나온 것: 호위 일감에서 비선점 SJF 는 FCFS 와 거의
같다 — 큰 것이 먼저 와 이미 돌고 있어서, 짧은 것부터의 효과는 선점이 있어야 난다.

## 흐름

```
판정 1 (10.2 분) → 사용자 확인 → 사양 넷 (12.5 ~ 18.6 분 · 0.21 ~ 0.28M)
사양이 오는 대로 whole-builder 를 모두 — 열여섯이 동시에
완제품 하나 9.4 ~ 16.5 분 (평균 11.7) · 평균 0.15M
감사 칸 밖 · 지적은 만든 에이전트에게
등록 한 번 (--topic 일곱) · 관성 · 개념 메타 넷(묶음마다, 10.4 ~ 12.3 분)
typecheck · test · scene-audit
```

사양 에이전트가 판정서에서 바꾼 자리가 많았고 모두 받아들였다 — 디스크 방향을 조각에 맞춰 위로 통일, MLFQ 를 조각처럼 비선점으로,
round-robin · priority · segmentation 의 데이터를 단조로 갈리는 것으로 새로 짬, 가상 메모리 모형 상수 조정.

## 감사가 잡은 것

열여섯 가운데 **열이 위반 0**. 지적은 모두 만든 에이전트가 고쳤다.

| 완제품 | 지적 |
| --- | --- |
| disk-scheduling | 설명 글의 막대 위치 · 같은 실린더 요청을 말없이 건너뜀 · 틀린 초기 자료를 걸러 버림 (C6 둘) |
| mutex | 주인 띠를 "틱이 끝난 뒤의 주인" 으로 칠해 unlock 칸이 다음 주인 색 — 도는 동안의 주인(`holder`)을 따로 둠 |
| paging | TLB 칸 번호 0 부터(자리라 1 부터) · 새 판 #0 에 앞 판 코드 줄이 켜진 채 |
| virtual-memory | 화면 머리말(`description`)이 "틱이 모두 디스크를 기다린다" 고 단정 — 무너진 판도 24% 돈다 |
| round-robin-quantum · priority-aging | 설명 글의 셈 · 짝이 한 칸 어긋난 수열 |
| journaling | (위반 아님 판정) 두 줄 중 코드 패널은 저널 줄만 따른다 — 화면이 표지로 밝혀 통과 |
| page-replacement | (호스트 요청) phase 를 정책마다 나눠 실행되지 않는 줄을 켜지 않게 — 셋 → 여섯 |

권고로 고친 것: 걸음 0 이 빈 화면(scheduling-policy · weighted-fair-share) · 틀린 `initialData` 를 조용히 기본값으로(셋) · 입력 루프의 죽은 코드.

## 에이전트가 짚은 것

- `messages` 에 상수를 넣으면 facet-i18n 검사가 선언으로 못 본다 · 번역하지 않는 약어도 열 언어 객체로 → **카드에 넣음**
- `initialData` 타입을 `interface` 로 두면 index signature 로 tsc 가 막힌다 → **카드에 넣음**
- 공통 안내문과 호스트 프롬프트가 임시 파일 자리를 다르게 적었다(`<SP>/<묶음>/<이름>/` 대 `<SP>/<이름>/`) — 넷이 짚었다. 다음 배치에서 한쪽으로
- scene-audit 를 에이전트가 파일을 고치는 동안 돌리면 vite 가 감사 페이지를 다시 불러 0 부터 다시 잰다 → **조각 프로토콜에 넣음**
- 요약에서 dev 서버 포트를 5174 로 옮겨 적었다가 다른 프로젝트 서버(aperi21)를 쳤다. FACET 은 5173 — 포트는 늘 cwd 로 찾는다

## 계기

```
관성        최고 0.15 · 좌표 0.34 · 어휘 8 · 운동 15/16   PASS
whole-check 열여섯 모두 오류 0 · 경고 0
개념 감사   기계 판정 통과 (미선언 참조 0 · 빈 자리 0)
전수        typecheck PASS · test 2330/2330
scene-audit 조각 쉰넷 — 흔들림 0 · 왕복어긋남 0 · 완주못함 0 (사용자 서버 5173, 모든 편집이 끝난 뒤)
```

## 개념 메타

묶음 넷(스케줄 · 프로세스와 동시 실행 · 메모리 · 저장과 입출력)마다 에이전트 하나가 **완제품과 조각을 함께** 썼다 — 일흔(새 69 + 기존
context-switching 에 대비 잇기). 앞 배치처럼 조각 파일을 다시 여는 값이 없었다. definition 낱말 겹침 최고 0.29(조각 ↔ 조각, 일반어).

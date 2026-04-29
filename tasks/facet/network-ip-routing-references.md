# 네트워크 계층 IP 라우팅 — 시각화 레퍼런스 분석

조사 대상: 네트워크 계층의 IP 라우팅. 라우터들이 목적지 IP 를 보고 라우팅 테이블을 조회해 다음 홉(next hop) 을 결정하고, hop-by-hop 으로 패킷을 전달하는 과정. longest prefix match, 라우팅 테이블 구조, 경로 선택, TTL 감소 등을 포함.

## 1. 검색 결과

검색은 영어와 한국어를 함께 사용해 "IP routing visualization", "packet forwarding animation", "longest prefix match visualization", "BGP visualization", "internet topology map", "traceroute visualization", "routing table animation", "라우팅 테이블 시각화", "패킷 포워딩 애니메이션", "인터넷 지도", "OSPF 시뮬레이션" 등으로 폭넓게 훑었다. 학술/표준 도구, 인기 해설, 독창적/예술적 시각화, 다른 분야 메타포까지 11 개를 선정했다.

학술/표준 도구
- Cisco Packet Tracer — https://www.netacad.com/courses/packet-tracer
- GNS3 (Graphical Network Simulator) — https://www.gns3.com/
- Kurose & Ross "Computer Networking" 동반 애니메이션 (Pearson) — https://gaia.cs.umass.edu/kurose_ross/interactive/
- N3 Network Simulator (NS-3) NetAnim — https://www.nsnam.org/wiki/NetAnim
- Wireshark + 시각화 플러그인 — https://www.wireshark.org/

인기 해설/대중화
- 3Blue1Brown 협업 채널 (Computerphile) "How does the Internet Work?" 시리즈 — https://www.youtube.com/user/Computerphile
- Practical Networking — Subnetting Mastery / Routing 시리즈 — https://www.practicalnetworking.net/
- Ben Eater — Networking from the ground up — https://eater.net/

독창적/예술적
- Opte Project — Internet Map (Barrett Lyon) — https://www.opte.org/
- CAIDA Internet Topology / Archipelago — https://www.caida.org/projects/ark/
- Hurricane Electric BGP Toolkit — https://bgp.he.net/
- BGPlay / RIPEstat — https://stat.ripe.net/widget/bgplay
- Submarine Cable Map (TeleGeography) — https://www.submarinecablemap.com/

다른 분야 메타포
- 우편 분류기 / 택배 허브 다이어그램 (FedEx, UPS sortation hub 안내 영상)
- 서울 지하철 노선도 환승 안내 (Hop-by-hop 메타포)
- 공항 수하물 라우팅 시스템 안내 영상

## 2. 레퍼런스 요약

### Cisco Packet Tracer
- 출처/URL: https://www.netacad.com/courses/packet-tracer
- 한 줄 정체성: 네트워크 학습용 표준 시뮬레이터. CCNA 교과 과정의 사실상 기본 도구.
- 시각 객체: 라우터/스위치/PC 아이콘(현실의 장비 외형 모사), 케이블 색상으로 매체 구분(시리얼/이더넷), 패킷은 작은 봉투(Envelope) 아이콘으로 링크 위를 슬라이드.
- 시간 표현: "Simulation Mode" 토글 — 실제 시간 흐름을 멈추고 패킷 한 개의 hop 단위로 step 진행. 좌측 이벤트 리스트가 시간축 역할.
- 메타포: "장비 룸을 위에서 내려다보는 다이어그램 + 봉투 배달".
- 강조: 각 hop 마다 OSI 레이어별 PDU 헤더 검사. "이 라우터에서 무슨 결정이 일어났나" 를 inspect 창으로 펼침.
- 인상적 디테일: 패킷이 라우터에 도착하면 "incoming/outgoing" 으로 색이 갈리고, ARP/Ping 같은 보조 트래픽도 동시에 보여 줌.
- 약점: 실제 하드웨어 비유에 충실하다 보니 "왜 이 hop 으로 갔는가" 의 결정 로직(라우팅 테이블 lookup)은 별도 창을 열어야 보임. 시각이 분산.

### GNS3 + NetAnim
- 출처/URL: https://www.gns3.com/, https://www.nsnam.org/wiki/NetAnim
- 한 줄 정체성: 실제 IOS 이미지를 띄우는 전문가 시뮬레이터(GNS3) 와, NS-3 시뮬레이션 결과를 후처리 애니메이션으로 보는 NetAnim.
- 시각 객체: 토폴로지 그래프(노드+엣지), 패킷은 엣지 위 작은 색 점으로 흐름.
- 시간 표현: NetAnim 은 시간 슬라이더로 임의 시점으로 점프. 패킷 트레이스를 fast-forward / rewind.
- 메타포: "교통 흐름 카메라 재생".
- 강조: 큐잉/지연/드롭 등 정량적 동역학.
- 약점: 시각이 매우 사무적. 라우팅 결정의 "이유" 보다 결과 트래픽 패턴.

### Kurose & Ross 동반 애니메이션
- 출처/URL: https://gaia.cs.umass.edu/kurose_ross/interactive/
- 한 줄 정체성: 대학 네트워크 교과서의 정석 애니메이션 모음. 챕터별 개념 1 개씩.
- 시각 객체: 단순화된 라우터 원, 직선 링크, 라벨 붙은 패킷.
- 시간 표현: Play / Pause / Step 버튼. 각 단계마다 텍스트 캡션이 갱신.
- 메타포: "교과서 그림이 한 장씩 넘어가는 슬라이드쇼".
- 강조: longest prefix match, distance vector / link state 알고리즘의 수렴 과정.
- 인상적 디테일: 라우팅 테이블이 옆 패널에 표 형태로 펼쳐져, 알고리즘 step 마다 셀 값이 in-place 갱신.
- 약점: 비주얼이 단조롭고, 상호작용이 step 버튼에 한정.

### Wireshark
- 출처/URL: https://www.wireshark.org/
- 한 줄 정체성: 실 트래픽 패킷 캡처 분석기. 시각화라기보단 "데이터 그리드".
- 시각 객체: 시간순 패킷 리스트, 헤더 트리, 바이트 hex/ASCII 패널.
- 시간 표현: 절대 타임스탬프 + 상대 타임스탬프 컬럼. "Follow stream" 으로 같은 세션 묶어 보기.
- 메타포: "비행기 블랙박스 로그".
- 강조: 헤더 필드 세부 (TTL 감소, src/dst IP, 체크섬). 학습자가 hop 마다 TTL 이 1 씩 줄어드는 것을 trace 로 직접 확인 가능.
- 약점: 토폴로지/공간감 없음. "어디로 갔는지" 가 아니라 "무엇이 지나갔는지".

### Computerphile "How the Internet Works"
- 출처/URL: https://www.youtube.com/user/Computerphile
- 한 줄 정체성: 영국 노팅엄대 채널의 전문가 인터뷰형 해설.
- 시각 객체: 화이트보드 그림 + 손글씨 + 말풍선. 가끔 화면 위에 단순한 그래픽 합성.
- 시간 표현: 강의자의 손이 그림을 그리며 진행.
- 메타포: "우체국에서 편지가 어떻게 전달되는지" 를 자주 사용. 라우팅 테이블 = 분류함.
- 강조: 큰 그림(왜 IP 가 필요한가, DNS 와의 관계).
- 약점: longest prefix match 같은 디테일은 깊이 다루지 않음.

### Practical Networking — Subnetting/Routing 시리즈
- 출처/URL: https://www.practicalnetworking.net/
- 한 줄 정체성: 엔지니어 시험 준비용 단계별 그림 강의(Ed Harmoush).
- 시각 객체: 표 + 화살표 + 색칠 비트(서브넷 마스크의 1 비트와 0 비트를 두 색으로 분리).
- 시간 표현: 정적 슬라이드 시퀀스.
- 메타포: "비트 자(ruler)" — 마스크가 자처럼 IP 위에 얹혀 prefix 길이를 잘라 보여 줌.
- 강조: longest prefix match 의 비트 단위 정렬. 라우팅 테이블 항목 여러 개가 동시에 매치되는 경우 가장 긴 prefix 가 이긴다는 규칙.
- 인상적 디테일: 32 비트 IP 를 4 옥텟 박스로 그리고, 마스크의 경계를 빨간 세로선으로 명시. 매치되는 항목과 안 되는 항목을 좌우로 나란히 비교.
- 약점: 정적이라 hop-by-hop 의 시간성을 못 보여 줌.

### Ben Eater — Networking from the ground up
- 출처/URL: https://eater.net/
- 한 줄 정체성: 하드웨어 빌드와 패킷 트레이스를 결합하는 DIY 영상 시리즈.
- 시각 객체: 실 회로 사진 + 화면에 hex dump 투사.
- 시간 표현: 영상 시간(녹화).
- 메타포: "전선 한 가닥부터 ARP, IP 까지 직접 만든다".
- 강조: 패킷의 물리적 실재. 라우팅 자체보다는 "패킷이 진짜로 거기 있다" 의 감각.
- 약점: 라우팅 테이블 구조 자체의 시각화는 약함.

### Opte Project — Internet Map
- 출처/URL: https://www.opte.org/
- 한 줄 정체성: Barrett Lyon 의 인터넷 토폴로지 예술 작품. 2003 년부터 갱신.
- 시각 객체: 검은 배경 위의 우주적 신경망 — 수백만 노드가 색깔 다른 광섬유처럼 방사상으로 펴져 있음.
- 시간 표현: 연도별 스냅샷, 일부 동영상은 시간 경과에 따른 인터넷 성장.
- 메타포: "은하수/뉴런/뿌리". 인터넷의 거대함과 자기조직성을 미적으로 압축.
- 강조: 스케일 — 한 패킷이 이 거대 그래프의 한 경로를 따라간다는 사실.
- 약점: 한 패킷의 라우팅 결정을 추적할 수는 없음. 거시 풍경.

### CAIDA Archipelago / Internet Topology
- 출처/URL: https://www.caida.org/projects/ark/
- 한 줄 정체성: 학술 측정 프로젝트의 토폴로지 시각화. AS 수준 그래프.
- 시각 객체: AS 노드를 동심원/방사형 레이아웃으로 배치, 링크는 실제 traceroute 데이터로 채움.
- 시간 표현: 정적 그래프 + 측정 시점별 여러 장.
- 메타포: "지리적 지도 + 그래프 레이아웃 하이브리드".
- 강조: AS 간 관계, peering 구조.
- 약점: 패킷 한 개의 시점에서 본 라우팅 결정 자체와는 거리.

### Hurricane Electric BGP Toolkit
- 출처/URL: https://bgp.he.net/
- 한 줄 정체성: AS/prefix 별 라이브 BGP 정보 툴.
- 시각 객체: 텍스트 테이블 + AS path 를 우→좌로 나열한 화살표 다이어그램.
- 시간 표현: 거의 정적, 새로고침으로 갱신.
- 강조: "이 prefix 는 어떤 AS 들을 지나서 도달하는가" 의 실제 인터넷 데이터.
- 약점: UI 가 엔지니어 친화적, 학습자에게는 친절하지 않음.

### BGPlay / RIPEstat
- 출처/URL: https://stat.ripe.net/widget/bgplay
- 한 줄 정체성: 특정 prefix 의 BGP 라우팅 변화를 시간축으로 재생.
- 시각 객체: AS 노드 그래프, 시간이 흐르면 엣지(AS path) 가 끊기고 새 엣지가 그어짐.
- 시간 표현: 타임라인 스크럽 — 사건(prefix hijack, 단선) 시점으로 점프 가능.
- 메타포: "교통 사고 후 우회 경로가 자동 생성되는 GPS".
- 강조: 라우팅이 정적이지 않고 BGP 가 사건에 반응한다는 사실.
- 인상적 디테일: 실제 사건(예: Pakistan Telecom YouTube hijack 2008) 을 재생할 수 있음.
- 약점: AS 단위라 한 라우터의 테이블 lookup 같은 미시는 안 보임.

### Submarine Cable Map (TeleGeography)
- 출처/URL: https://www.submarinecablemap.com/
- 한 줄 정체성: 해저 광케이블의 지리적 지도. "패킷이 정말로 바닥을 기어간다".
- 시각 객체: 메르카토르 세계지도 위의 색색 곡선들, landing point 가 점으로 클릭 가능.
- 시간 표현: 정적이지만 케이블 별 개통 연도 메타데이터.
- 메타포: "물리적 도로망".
- 강조: IP 라우팅의 가장 아래층 — 추상이 아니라 진짜 케이블 위를 흐른다.
- 약점: hop-by-hop 결정 로직과는 직결되지 않음.

### 우편 분류기 / 택배 허브 메타포
- 출처/URL: FedEx Memphis Hub 안내 영상 등 (https://www.youtube.com/results?search_query=fedex+sorting+hub).
- 한 줄 정체성: 컨베이어 + 분기 경로로 소포가 목적지별 슈트로 떨어지는 시스템.
- 시각 객체: 컨베이어 벨트, 바코드 스캐너, 상단 LED 가 슈트 번호 표시, 패키지가 옆 슈트로 슬라이드.
- 시간 표현: 실시간 + 카메라 슬로 모션.
- 메타포 (역방향 차용): 라우터 = 분류기, 패킷 = 소포, 라우팅 테이블 = 우편번호→슈트 매핑표, longest prefix match = "가장 구체적인 우편번호 규칙이 이긴다".
- 강조: hop-by-hop 의 직관적 이해. "한 허브에서 다음 허브로 던져지고, 다음 허브가 또 결정한다".
- 약점: 패킷 손실 / TTL 감소 같은 IP 고유 의미는 없음.

### 서울 지하철 환승 안내
- 한 줄 정체성: 노선도 위에 출발지→목적지 경로가 highlight 되고 환승역에서 노선이 바뀜.
- 시각 객체: 색띠로 구분된 노선, 환승역이 굵은 원, 현재 위치가 깜빡임.
- 메타포 (역방향 차용): 환승역 = 라우터, 노선 = 인터페이스, "다음 환승" = next hop. 단, 지하철은 출발 시 전체 경로가 결정되는 반면 IP 는 매 hop 에서 다시 결정한다는 점이 핵심 차이 — 이 차이를 강조하면 좋은 학습 포인트.

## 3. 공통 요소

수집된 레퍼런스에서 거의 항상 등장하는 시각 요소를 추린다.

- **노드(라우터) + 엣지(링크) 그래프**: Packet Tracer, GNS3, Kurose, BGPlay, CAIDA, Opte 모두 동일. 학습자는 IP 라우팅 = "그래프 위 경로 탐색" 으로 기대한다.
- **패킷 = 그래프 위를 움직이는 작은 객체**: 봉투(Packet Tracer), 색 점(NetAnim), 라벨 박스(Kurose). 시간을 점의 이동으로 표현.
- **라우팅 테이블 = 옆에 붙은 표**: 거의 모든 학술 툴에서 화면 한쪽에 표가 있고, lookup 시 매치된 행이 highlight.
- **시간 표현은 "재생/일시정지/스텝"**: 실시간 애니메이션 + step-through 가 표준. 시간 슬라이더는 BGPlay/NetAnim 같은 측정 도구에서 등장.
- **레이아웃은 자유 그래프 또는 지리 지도**: 학습 자료는 자유 그래프, 측정/예술은 지리 좌표.
- **하이라이트로 결정 지점을 강조**: 라우터 도착 시 펄스, 매치된 라우팅 테이블 행의 배경색 변화, 선택된 outgoing 인터페이스 색 강조.
- **헤더/메타데이터는 inspect 패널**: 클릭하면 펼쳐지는 사이드 패널에 src/dst IP, TTL, prefix 등을 텍스트로 노출.

학습자에게 형성된 기대 패턴 요약:
1. "라우터 = 동그라미, 링크 = 선" 으로 시작한다.
2. 패킷이 "선 위를 움직이는 점" 으로 등장한다.
3. 라우터에 도착하면 잠깐 멈췄다가 어딘가의 표를 본 뒤 다음 링크로 떠난다.
4. 표의 행 중 하나가 강조된다.
5. 결정 이유는 (대개) 따로 텍스트로 설명된다.

## 4. 공백

표준 시각화에서 잘 다루지 않거나 차원을 비틀 여지가 있는 영역.

- **Longest Prefix Match 의 비트 단위 시각화**: Practical Networking 만 진지하게 그림. 32 비트 IP 와 라우팅 테이블 prefix 들을 비트 단위로 정렬하고, 매치 길이가 가장 긴 항목이 "튀어나오는" 시각화는 거의 없다. 비트 격자(32×N) 위에 마스크 경계를 그리는 방식이 차원 차용 가능.
- **목적지 기반 결정의 "근시안성"**: hop-by-hop 의 핵심은 "각 라우터가 자기만의 결정을 내린다 — 출발 라우터는 끝까지 알지 못한다" 인데, 이를 직접 강조하는 시각화가 드물다. 지하철 메타포(전체 경로 사전 결정) 와 명확히 차별화할 포인트.
- **라우팅 테이블 자체의 데이터 구조 시각화**: trie / radix tree 로 라우팅 테이블을 구현하는 것이 표준이지만, 트리 형태로 lookup 과정을 보여 주는 자료는 학술 논문 외에는 거의 없다. FACET 의 tree-layout 자산과 직결.
- **TTL 의 의미적 시각화**: Wireshark 헤더 트리에서 숫자가 줄어드는 정도. 패킷 자체에 "수명 게이지" 같은 시각 요소를 붙여 hop 마다 줄어드는 모습을 보여 주는 사례가 거의 없다.
- **다중 패킷의 동시성**: 거의 모든 학습 시각화는 한 번에 한 패킷만 추적. 실제 라우터는 여러 패킷이 동시에 큐에 쌓이는데, 이를 "각 패킷이 독립적으로 결정된다" 는 사실로 활용한 시각화는 부족.
- **메타포 차용 영역**:
  - 우편/택배 분류 허브: 컨베이어 + 슈트 = 라우터의 인터페이스. 우편번호 = prefix.
  - 공항 수하물 라우팅: 태그 스캔 + 슈트 분기.
  - 강물의 유역(watershed): 가장 가까운 골짜기로 흐르는 물 = longest prefix match.
  - 다단계 분기 폭포(cascading splitter).
- **인터랙션의 미개척 영역**:
  - 학습자가 직접 라우팅 테이블에 행을 추가/삭제하면 패킷의 경로가 즉각 갱신되는 "regret-free" 편집.
  - 한 라우터의 테이블만 망가뜨리면 어떻게 되는지(블랙홀 시연).
  - "악의적인 longest prefix" 광고로 BGP hijack 을 작은 토폴로지에서 재현.
- **시간 표현의 다른 가능성**:
  - 패킷 한 개의 여정 전체를 "공간 곡선" 으로 한 장에 응축(스파게티 다이어그램).
  - hop 단위 X 축 vs 라우터 ID Y 축의 sequence 차트.
  - 같은 출발-목적지 쌍에 대해 라우팅 테이블이 바뀌면 경로가 어떻게 갈라지는지 분기 다이어그램.

## 5. 후속 작업 가이드

### 공통 강화 에이전트에게
가장 가치 있는 공통 요소는 다음 다섯 가지다. 이들을 "기본 골격" 으로 잡고 다듬을 것.

1. **노드+엣지 토폴로지** — 라우터를 동그라미, 링크를 선으로. 학습자 기대의 출발점이며 양보 불가.
2. **움직이는 패킷 객체** — 시간을 공간 이동으로 변환. step / play 컨트롤이 표준.
3. **라우팅 테이블 사이드 패널** — 매 hop 마다 lookup 이 일어났음을 표 행 highlight 로 증거 제시.
4. **결정 지점의 펄스/하이라이트** — 라우터에 패킷이 들어오면 잠깐 멈추고, 매치된 행이 빛나고, 선택된 outgoing 링크가 색칠된다는 3-스텝 micro-animation.
5. **헤더 inspect 패널** — src/dst IP, TTL 을 항상 클릭으로 펼칠 수 있어야.

다듬을 여지:
- 라우팅 테이블 행 highlight 가 "왜 그 행인가" 까지는 안 보여 주는 경우가 많음 — prefix 의 비트 매칭 길이를 같이 보이는 미세 시각화 추가.
- TTL 을 패킷 객체의 게이지/색 농도로 hop 마다 줄여 보이는 디테일.
- 한 라우터에서 다음 hop 결정 직전에 "후보 경로 N개 → 1개 선택" 의 짧은 수축 애니메이션.

### 새로운 방식 에이전트에게
가장 흥미로운 공백은 다음 셋이다.

1. **Longest Prefix Match 의 비트 격자 시각화** — 32 비트 IP 를 셀로 펼치고, 라우팅 테이블의 모든 prefix 후보를 같은 비트 정렬로 위아래로 쌓아, "가장 긴 매치가 길이로 이긴다" 를 길이 비교 시각화로 직접 전달. FACET 의 격자/배열 자산과 잘 맞음.
2. **trie/radix tree 라우팅 테이블** — IP 비트를 따라 트리를 내려가며 가장 깊이 닿은 노드의 next hop 을 채택. FACET 의 tree-layout 자산을 즉시 재사용 가능. 라우팅 테이블이 "표" 가 아니라 "트리" 라는 사실을 가르치는 거의 유일한 길.
3. **우편 분류기 / 컨베이어 메타포** — 라우터를 컨베이어+슈트로 그려, 패킷 = 소포, prefix = 우편번호, longest prefix match = "가장 구체적 규칙 우선". hop-by-hop 의 직관을 강하게 전달. 지하철 메타포와 차별화하는 포인트는 "각 허브가 독립적으로 결정한다 — 발신 시점에는 경로 전체가 정해지지 않았다".

시도할 추가 메타포:
- 강물 유역(가장 가까운 골짜기로 떨어진다 = longest prefix match)
- 다단계 폭포 분기

**절대 빼면 안 될 본질적 개념** (어느 메타포를 택해도 이건 시각에 나타나야 한다):
- **목적지 기반 결정**: 다음 hop 은 "목적지 IP" 만 보고 정해진다. 출발지·경로 이력은 (기본 라우팅에선) 안 본다.
- **Hop-by-hop**: 출발 라우터가 끝까지 알지 못한다. 매 라우터가 다시 결정한다.
- **라우팅 테이블 lookup**: 결정의 근거는 라우터 안의 표(또는 trie). 즉석 계산이 아니다.
- **Longest Prefix Match**: 매치 후보가 여럿이면 가장 긴 prefix 가 이긴다.
- **TTL 감소**: 패킷은 영원히 떠돌지 않는다. 매 hop 마다 1 씩 감소, 0 이 되면 폐기.

이 다섯이 다 보이지 않으면 IP 라우팅을 가르쳤다고 할 수 없다.

## 6. 대상 개념 요약

학습자가 데모와 함께 읽을 짧은 설명(2~4 문장):

> 인터넷의 패킷은 한 라우터에서 다음 라우터로 한 칸씩 던져지며 목적지에 도달한다. 각 라우터는 패킷의 목적지 IP 만 보고, 자기 안의 **라우팅 테이블**에서 가장 잘 맞는 규칙(가장 긴 prefix 가 매치되는 행, **Longest Prefix Match**) 을 골라 다음 라우터로 보낸다. 출발 라우터는 끝까지의 경로를 알지 못한다 — 매 hop 마다 그 라우터가 자기만의 결정을 새로 내린다(**Hop-by-hop forwarding**). 패킷 머리에 든 **TTL** 은 hop 마다 1 씩 줄어들어, 길을 잃은 패킷이 영원히 떠도는 일을 막는다.

전문 용어 풀어쓰기 (캡션/툴팁용):
- **라우터(router)**: 네트워크의 갈림길. 들어온 패킷을 어디로 보낼지 결정하는 장치.
- **IP 주소**: 인터넷 상의 집 주소. 32 비트(IPv4) 숫자.
- **prefix**: IP 주소의 앞부분 몇 비트. 우편번호의 앞자리와 비슷.
- **라우팅 테이블(routing table)**: "이런 prefix 의 목적지는 저쪽 인터페이스로" 를 적은 표.
- **next hop(다음 홉)**: 패킷을 곧바로 넘겨 줄 옆 라우터.
- **Longest Prefix Match(최장 prefix 매치)**: 표의 여러 규칙이 동시에 맞을 때, 가장 구체적인(가장 긴) 규칙이 이긴다는 약속.
- **Hop-by-hop**: 한 칸씩 결정한다는 뜻. 매 라우터가 자기 차례에 다시 본다.
- **TTL(Time To Live)**: 패킷의 수명. 매 hop 마다 1 줄고 0 이면 폐기.

후속 데모는 이 요약을 시각화 옆 또는 안에 표시해, 그림과 글이 같은 화면에서 서로 가리키도록 구성하면 된다.

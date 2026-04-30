# IP 라우팅 시각화 레퍼런스 분석

> 분류 보고서 결과: type=systemBehavior, 진행 모델=메시지 시퀀스형, 도메인=network. 핵심 학습 질문=한 패킷이 어떻게 각 라우터의 라우팅 테이블 조회와 next-hop 결정만으로 출발지에서 목적지까지 hop-by-hop 으로 길을 찾아가는가. 베이스 범위는 데이터 평면 (forwarding). 표준 교과서 도식·인터랙티브 시뮬레이터·실제 인터넷 토폴로지 시각화·인기 해설·한국어 자료·우편 비유 인접 자료까지 폭넓게 수집했다.

## 1. 검색 결과

총 10개 레퍼런스를 수집했다. 표준 교과서 자료 2건 (Kurose-Ross 인터랙티브 longest prefix matching, Cloudflare Learning), 인터랙티브 시뮬레이터 3건 (Cisco Packet Tracer, INET / OMNeT++ Routing Table Visualizer, simulations4all Network Packet Journey), 실제 인터넷 토폴로지 2건 (BGPlay, Opte / KMCD Internet Infrastructure Map), traceroute 시각화 1건 (Traceroute Mapper / VisualRoute), 인기 해설 / 우편 비유 1건 (ByteByteGo + Practical Networking + 우편 비유), 한국어 자료 2건 (NETMANIAS 패킷 포워딩 과정, 첼시팬 IP 라우팅 흐름 + Velog routing-table). 같은 "라우터 노드 + 링크 + 패킷" 골격 위에서도 강조 축 (테이블 조회의 운동 / 라우터 단위 분산 결정 / 지리 좌표 매핑 / AS 단위 BGP 동선) 이 갈라진다.

검색어:
- 영어: "IP routing visualization packet forwarding hop by hop animation interactive", "routing table longest prefix match diagram visualization Kurose Ross", "traceroute visualization map internet routing graph opte", "Cisco Packet Tracer routing demo network simulator IP packet animation", "ByteByteGo how does the internet work packet routing illustration", "Cloudflare blog BGP routing illustration packet hop", "submarine cable map BGP visualization dashboard internet topology", "TTL hop count packet forwarding visualization animation diagram", "postal service mail sorting metaphor IP routing analogy", "Practical Networking Packet Traveling series ARP routing"
- 한국어: "IP 라우팅 시각화 다이어그램 패킷 포워딩 hop by hop", "라우팅 테이블 시각화 longest prefix match 다이어그램 서브넷"

## 2. 레퍼런스 요약

### R1. Kurose-Ross — Longest Prefix Matching Interactive

- 출처: gaia.cs.umass.edu (Kurose-Ross "Computer Networking: A Top-Down Approach" 공식 인터랙티브 보조 자료)
- URL: https://gaia.cs.umass.edu/kurose_ross/interactive/longestprefix.php , https://gaia.cs.umass.edu/kurose_ross/interactive/
- 한 줄 정체성: 8비트 호스트 주소·소형 forwarding table 한 장만으로 longest prefix match 조회 자체를 풀어보게 만드는, 라우팅 테이블의 "결정 순간" 만 떼어낸 작은 인터랙티브.
- 시각 객체: 좌측 forwarding table (prefix · interface 두 컬럼), 우측 입력란 (8비트 destination address). 정답을 맞히면 매칭된 prefix 행이 하이라이트되고 화살표가 해당 인터페이스 번호로 뻗는다.
- 시간 표현: 사용자가 답을 제출하는 단발 사건. 라우터 사이의 운동은 없고 "한 라우터 안 한 번의 lookup" 만 시간으로 등장.
- 메타포: 사전 검색 — 가장 긴 일치 prefix 찾기. 텍스트 비교 게임에 가까움.
- 강조: **longest prefix match 가 이진 비트 단위 매칭** 이라는 사실. forwarding table 의 각 행이 한 prefix 와 한 interface 의 짝이라는 자료구조 정체성.
- 인상적 디테일: 8비트 단순화로 학습자가 직접 비트를 읽을 수 있다 — 32비트 IPv4 의 추상성을 일부러 깎아낸 교육적 결정. 정답·오답을 즉시 피드백.
- 약점: 라우터 한 대만 다룬다. hop-by-hop 의 분산 결정·next-hop 의 운동·TTL 같은 시스템 행동은 전부 빠져 있다. 시각이 "테이블 + 인터페이스 번호" 의 텍스트 도식으로 제한.

### R2. Cloudflare Learning — What is Routing? & What is BGP?

- 출처: cloudflare.com/learning (Cloudflare 공식 학습 페이지)
- URL: https://www.cloudflare.com/learning/network-layer/what-is-routing/ , https://www.cloudflare.com/learning/security/glossary/what-is-bgp/
- 한 줄 정체성: AS 박스를 노드로, 그 사이 링크를 선으로 그린 **간소화된 인터넷 그래프** 위에서 두 후보 경로를 같이 보여 "BGP 가 더 짧은 경로를 고른다" 를 직관화한 표준 해설 도식.
- 시각 객체: AS1·AS2·AS3·AS6 등 라벨이 붙은 6~7개 원/타원 노드 + 그 사이 굵은 선. 한 패킷의 동선이 두 색 화살표 (예: 초록 = 짧은 경로, 빨강 = 긴 경로) 로 동시에 비교됨.
- 시간 표현: 정적 일러스트. 같은 출발-도착 사이 두 후보 경로를 한 컷에 겹쳐 시간을 압축.
- 메타포: "BGP 는 인터넷의 우편 서비스" — 가능한 모든 길을 본 뒤 가장 좋은 길을 고른다. AS = 도시, 링크 = 도로.
- 강조: **AS 단위 추상화** — 개별 라우터가 아니라 AS 묶음이 hop 단위가 된다. 두 경로의 hop 수 차이로 "왜 한 경로가 선택되는가" 를 시각화.
- 인상적 디테일: hop 수가 노드 개수로 직접 보이는 단순함. 라우팅 정책 (선호 / 차단) 같은 복잡한 결정은 본문 텍스트로만 흘리고 도식은 가장 단순한 형태로 유지.
- 약점: 데이터 평면의 hop-by-hop 운동이 전혀 없다. 라우팅 테이블·next-hop·TTL 도 안 보임. AS 단위라 "한 라우터의 결정" 이 사라진다.

### R3. Cisco Packet Tracer — Simulation Mode

- 출처: netacad.com (Cisco Networking Academy 공식 시뮬레이터, CCNA 교육용)
- URL: https://www.netacad.com/learning-collections/cisco-packet-tracer , https://www.packettracernetwork.com/
- 한 줄 정체성: 실 장비를 본뜬 라우터·스위치·PC 아이콘을 드래그앤드롭으로 배치하고, **Simulation Mode** 에서 패킷이 봉투 모양 아이콘으로 한 hop 씩 이동하는 운동을 보여주는 사실상의 표준 교육 시뮬레이터.
- 시각 객체: 라우터 (원반 + 화살표 마크), 스위치 (네모), PC (모니터 아이콘) 가 사용자가 그린 토폴로지대로 배치. 패킷은 색깔 봉투. PDU List 패널에 진행 중인 패킷 목록이 표 형태.
- 시간 표현: Realtime / Simulation Mode 토글. Simulation Mode 는 시간을 이산 이벤트로 끊어 사용자가 Capture / Forward 버튼으로 한 hop 씩 진행. 일시정지·속도 조절 가능.
- 메타포: 실 장비 미니어처 — "지금 OSI 어느 계층을 통과하는지" 도 함께 표시되는 "X-ray 가 켜진 실험실".
- 강조: **이벤트 단위 시간** — 패킷 도착 / 라우팅 결정 / 다음 hop 송신을 끊어서 보여 학습자가 "지금 어디서 무엇이 결정되었는가" 를 느릴 때까지 멈춰 본다. ARP·OSPF·BGP 까지 한 시뮬레이터 안에서 모두 다룸.
- 인상적 디테일: 패킷 봉투를 클릭하면 OSI 7 계층의 헤더가 펼쳐지는 패널. "L3 라우팅 결정" 이 봉투 안 IP 헤더의 destination 필드와 라우터의 routing table 행을 같이 띄워서 보임.
- 약점: 학습 곡선이 가파르다. CLI 설정과 토폴로지 그리기가 선행 부담. 봉투가 한 hop 씩 깡충 뛰는 운동이 다소 게임적이라 longest prefix match 의 비트 매칭 같은 내부 결정은 텍스트 패널로 빠진다.

### R4. INET / OMNeT++ — Routing Table Visualizer & Network Path Activity

- 출처: inet.omnetpp.org (INET Framework 4.x, OMNeT++ 기반 학술용 네트워크 시뮬레이터)
- URL: https://inet.omnetpp.org/docs/showcases/visualizer/canvas/routingtable/doc/index.html , https://inet.omnetpp.org/docs/showcases/visualizer/canvas/networkpathactivity/doc/index.html
- 한 줄 정체성: **라우팅 테이블의 각 행을 토폴로지 위 화살표로 직접 그려** "이 라우터의 이 prefix 는 저 next-hop 으로 보낸다" 를 링크 라벨로 변환한 학술 시뮬레이터의 RoutingTableVisualizer 모듈.
- 시각 객체: 노드 (라우터·호스트) 가 그래프 좌표에 배치되고, 각 라우팅 엔트리는 source 노드에서 next-hop 노드로 향하는 라벨 달린 화살표. 라벨에 prefix 가 텍스트로 적힘. NetworkPathActivity 는 실제 패킷 흐름을 별도 색 화살표로 누적 표시.
- 시간 표현: 시뮬레이션 시간 진행에 따라 화살표가 동적으로 갱신 (라우팅 프로토콜이 수렴하면 추가/제거). 패킷 활동은 "최근 몇 초간 다닌 길" 로 흐려졌다 진해짐.
- 메타포: 지도 위 화살표 — 라우팅 테이블이 토폴로지에 "투영" 된다. 정적 자료 구조가 시각 공간으로 펼쳐짐.
- 강조: **테이블과 토폴로지의 직접 매핑** — 텍스트로 보던 라우팅 테이블이 그래프 위 화살표 묶음이라는 사실을 강제. 컨트롤 평면 결과물이 데이터 평면의 길과 어떻게 일치하는지가 한 화면에 동시 표현.
- 인상적 디테일: 같은 노드에 여러 prefix 화살표가 부채꼴로 펼쳐진다 — "이 라우터의 시야는 이 화살표들의 합" 임을 시각으로 강제. NetworkPathActivity 와 겹쳐 보면 실제 패킷이 그 화살표 중 어느 것을 골랐는지가 한 컷에 보임.
- 약점: 학술 시뮬레이터라 학습자가 직접 시나리오를 만들어야 한다. 인터랙티브 웹 데모가 아니라 OMNeT++ IDE 안에서만 실행됨. 추상도가 높아 longest prefix match 의 비트 단위 매칭 운동은 약함.

### R5. simulations4all — Network Packet Journey Simulator

- 출처: simulations4all.com (브라우저 기반 무료 교육용 시뮬레이션)
- URL: https://simulations4all.com/simulations/network-packet-journey-simulator
- 한 줄 정체성: 패킷 스위칭 vs 회선 스위칭 vs 메시지 스위칭, shortest path / flooding / distance vector / link state 를 같은 토폴로지 위에 토글로 흘려 비교하게 만든 **알고리즘 비교형 인터랙티브**.
- 시각 객체: 격자 위 라우터 노드 (작은 원) + 링크. 패킷은 색 점으로 노드 사이를 미끄러짐. 큐는 노드 옆에 누적되는 작은 점들의 줄. 알고리즘별로 채택 경로가 다른 색으로 강조.
- 시간 표현: 연속 애니메이션 + 속도 슬라이더. 큐가 차오를 때 정체가 점들의 누적으로 가시화.
- 메타포: 도시 교통망 — 노드 = 교차로, 링크 = 도로, 큐 = 교차로 앞 차량 정체.
- 강조: **알고리즘 다양성 + 큐잉/혼잡** — 같은 출발-도착 쌍에 대해 여러 라우팅 알고리즘이 다른 길을 고른다는 사실을 같은 화면에서 비교. 큐 누적과 패킷 손실이 시각 사건으로 등장.
- 인상적 디테일: 회선 / 메시지 / 패킷 스위칭이 같은 토폴로지에서 어떻게 다른지를 토글로 보여줌 — IP 라우팅을 "패킷 스위칭의 한 종류" 로 자리매김.
- 약점: 라우팅 테이블이라는 자료 구조가 시각으로 안 보인다. longest prefix match 같은 라우터 내부 결정도 추상화. "라우터가 알고리즘을 안다" 는 식으로 가정되어 hop-by-hop 분산 결정의 정체성이 약하다.

### R6. BGPlay — BGP Routing Visualization

- 출처: bgplay.massimocandela.com (RIPE NCC RIS / Routeviews 데이터를 시각화하는 학술·실무 도구)
- URL: https://bgplay.massimocandela.com/ , https://www.ripe.net/analyse/internet-measurements/routing-information-service-ris/
- 한 줄 정체성: 한 IP prefix 에 대한 **AS 경로의 시간 진화** 를 force-directed 그래프 위에서 동영상으로 재생해 "라우팅이 깨지고 다시 맺어지는 사건" 을 보여주는 BGP 분석 도구.
- 시각 객체: AS 가 원형 노드, AS 사이 BGP 인접이 선. 특정 prefix 의 AS path 가 굵은 강조선으로 그래프 위에 그려짐. 시간 슬라이더가 화면 하단.
- 시간 표현: **타임라인 슬라이더** — 사용자가 분/시간 단위로 시점을 옮기면 강조선이 재배치된다. 라우팅 변화 (path 추가 / 제거 / withdraw) 가 슬라이더 이벤트로 누적.
- 메타포: 시간 여행 가능한 지하철 노선도 — 노선이 매 순간 살짝씩 다르게 그려짐. AS 가 역, BGP path 가 환승 경로.
- 강조: **컨트롤 평면의 시간성** — 데이터 평면 운동 대신 라우팅 정보 자체의 변화 (BGP UPDATE / WITHDRAW) 가 시간 축의 1급 사건. 같은 prefix 가 다른 시점에 다른 길로 도달함.
- 인상적 디테일: BGP 사고 (예: 2008 Pakistan Telecom YouTube 사건) 가 강조선의 급격한 재배치로 시각화 — 정상 / 비정상 라우팅의 차이를 학습자가 직관으로 잡는다.
- 약점: 패킷 자체의 hop-by-hop 운동은 안 보인다. AS 단위 추상으로 라우터 내부 라우팅 테이블·longest prefix match 도 부재. 데이터 평면 학습용은 아님.

### R7. Traceroute Mapper / VisualRoute / Geo Traceroute

- 출처: stefansundin.github.io/traceroute-mapper, gsuite.tools/traceroute, geotraceroute.com, visualroute.visualware.com (지리좌표 기반 traceroute 시각화 군)
- URL: https://stefansundin.github.io/traceroute-mapper/ , https://gsuite.tools/traceroute , https://geotraceroute.com/ , https://visualroute.visualware.com/
- 한 줄 정체성: 실제 traceroute 출력의 각 hop IP 를 GeoIP 로 매핑해 **세계지도 위에 점으로 찍고 선으로 잇는** 한 줄짜리 동선 시각화 군.
- 시각 객체: 세계지도 (Mercator 또는 globe) 위에 hop 별 점 + 점 사이를 잇는 색선. 각 점에 hover 하면 IP·도시·RTT 가 풍선 박스로. RTT 는 점 색 (초록 → 빨강 그라디언트) 으로 표현되기도 함.
- 시간 표현: 정적 결과 또는 점이 순차적으로 찍히는 1~2초 애니메이션. 인접 RTT 차이가 색으로 즉시 사건화.
- 메타포: 비행기 항로 — hop 이 도시, 패킷이 비행기. 대륙을 가로지르는 선이 인터넷의 물리 거리감을 환기.
- 강조: **물리 지리와 가상 라우팅의 동시 표현** — 패킷이 실제로 어느 도시·국가를 거쳐가는지를 직관에 새긴다. RTT 색으로 "어디서 느려졌는가" 가 사건으로 보임.
- 인상적 디테일: 같은 목적지를 두 번 traceroute 하면 다른 경로가 그려질 수 있다 — asymmetric routing / 라우팅 변경의 흔적이 사용자 관찰로 직접 발견됨. "별 표시 (* * *)" hop 이 점 없는 빈 구간으로 등장.
- 약점: 라우터 내부 결정·라우팅 테이블·next-hop 결정 과정이 전부 추상화. GeoIP 부정확으로 한 라우터가 엉뚱한 도시에 찍히기도 함. hop-by-hop "결정" 이 아니라 hop 의 결과만 보임.

### R8. Opte Project & KMCD Internet Infrastructure Map

- 출처: opte.org (Barrett Lyon, BGP Route Views 기반 인터넷 지도) + map.kmcd.dev (TeleGeography·PeeringDB·Routeviews 통합 시각화) + Submarine Cable Map
- URL: https://www.opte.org/the-internet , https://map.kmcd.dev/ , https://www.submarinecablemap.com/
- 한 줄 정체성: BGP 광고 / IP prefix 점유 / 해저 케이블을 하나의 거대한 그래프·지도 위에 중첩한 **인터넷 그 자체의 사진**. 학습보다 미적·인상적 충격이 강하다.
- 시각 객체: Opte 는 force-directed 그래프 — AS 가 점, 인접이 선, 색은 대륙. KMCD 는 지도 위 해저 케이블 + 피어링 IXP + IP 광고 누적량. 점 수만 수십만 단위.
- 시간 표현: Opte 는 정지 이미지 또는 연도별 스냅샷 비교. KMCD 는 연도 슬라이더로 "케이블이 늘어나는 운동" 을 시간 축으로 보여줌.
- 메타포: 우주 사진 — 별 / 은하수처럼 보이는 인터넷. "내가 쓰는 인터넷이 이만큼 거대한 그래프의 한 점" 이라는 스케일 충격.
- 강조: **거대 스케일 + 물리 인프라** — 라우팅이 어디 위에서 일어나는지 (해저 케이블·IXP) 의 물질성. 추상 토폴로지가 아닌 지구 위 실물.
- 인상적 디테일: Opte 의 graph 색상이 대륙별로 자연스럽게 클러스터링 — AS 인접 그래프만으로 지리가 자기조직화로 드러난다. KMCD 는 연도 슬라이더로 "1990 vs 2026 인터넷" 을 비교.
- 약점: 한 패킷의 동선은 안 보인다. 학습용이 아닌 풍경. 라우팅 테이블·hop-by-hop 결정·TTL 같은 메커니즘 디테일은 전혀 없음. "장식적 아름다움" 의 자료.

### R9. ByteByteGo + Practical Networking — Packet Traveling

- 출처: bytebytego.com 가이드 + practicalnetworking.net "Packet Traveling" 시리즈
- URL: https://bytebytego.com/guides/explaining-8-popular-network-protocols-in-1-diagram/ , https://blog.bytebytego.com/p/network-protocols-run-the-internet , https://www.practicalnetworking.net/series/packet-traveling/packet-traveling/ , https://www.practicalnetworking.net/series/packet-traveling/host-to-host-through-a-router/
- 한 줄 정체성: 호스트 → 스위치 → 라우터 → 인터넷 의 단계별 박스 일러스트로 "패킷이 어디서 무엇을 거치는가" 를 **한 장 인포그래픽** 으로 풀어쓴 인기 해설 자료군.
- 시각 객체: PC 모양 호스트 박스, 라우터 / 스위치 박스, 케이블 / 안테나 / ISP 클라우드 아이콘. 패킷은 봉투 또는 색 박스. ByteByteGo 는 평면 단색·아이소메트릭 풍 일러스트, Practical Networking 은 굵은 박스 + 헤더 펼침 다이어그램.
- 시간 표현: 정적 단계별 다이어그램. 본문에서 1단계 → 2단계 → ... 식으로 텍스트가 시간을 보강. Practical Networking 은 ARP 요청 / 응답 / 라우팅 결정 / 다음 hop 송신을 단계별 그림으로 분리.
- 메타포: 우편 사서함 + ARP 전화번호부. "라우터는 우체국, 스위치는 같은 동네 우편 분배함, ARP 는 이름 → 전화번호 변환".
- 강조: **L2 (스위치 / MAC) 와 L3 (라우터 / IP) 의 분리** — 같은 패킷이 라우터를 통과할 때 IP 헤더는 그대로지만 MAC 헤더는 매 hop 새로 쓰여진다는 사실을 헤더 펼침 다이어그램으로 강제.
- 인상적 디테일: Practical Networking 은 한 패킷의 IP src/dst, MAC src/dst 를 hop 마다 표로 펼쳐 "어떤 필드가 변하고 어떤 필드가 안 변하는가" 를 비교. 학습자가 "L3 추상의 안정성" 을 손으로 잡는다.
- 약점: 정적 그림 위주. longest prefix match 의 비트 매칭은 텍스트로만. 인터랙션 / 운동 부재. 단일 시나리오에 묶여 다중 패킷 / 다중 라우터의 동시성은 안 보임.

### R10. NETMANIAS + 첼시팬 + Velog — 한국어 실무·학습 자료

- 출처: netmanias.com (한국 네트워크 전문 미디어) + chelseafandev.github.io (개발자 블로그) + velog.io (학습 노트 모음)
- URL: https://www.netmanias.com/ko/post/blog/5521/arp-ip-routing-l3-switch-network-protocol/part-2-ip-router-packet-forwarding-process , https://chelseafandev.github.io/2021/12/06/ip-routing-flow/ , https://velog.io/@agnusdei1207/routing-table
- 한 줄 정체성: 한국어권에서 "라우터 한 대 안에서 패킷이 무엇을 거치는가" 를 **FIB / RIB / ARP 테이블 / 패킷 프로세서 / 스위치 모듈 / Egress Buffer** 단위로 펼쳐 보여주는 실무·학습 박스 다이어그램 군.
- 시각 객체: NETMANIAS 는 라우터를 큰 박스로 그리고 그 안에 Ingress 포트 → Packet Processor → Switch Module → Egress Buffer → Egress 포트의 파이프라인. FIB 는 작은 표로 옆에 붙음. 첼시팬 / Velog 는 외부 토폴로지 (호스트 - 라우터 - 호스트) + 라우팅 테이블 표를 같이 둔다.
- 시간 표현: 정적 단계별 다이어그램. 글의 흐름이 "패킷 도착 → FIB lookup (LPM) → next hop 결정 → 인터널 헤더 부착 → 스위치 → egress" 의 시간 순서.
- 메타포: 공장 컨베이어 + 사물함 — 라우터 내부의 파이프라인이 부품 처리 라인처럼 그려짐. 라우팅 테이블은 사물함 번호표.
- 강조: **라우터 내부의 자료구조 분리** — FIB (forwarding 용 빠른 표) 와 RIB (routing 용 마스터 표) 가 다른 박스로. ARP 테이블이 또 별개로. "한 라우터 안에 여러 표가 있다" 는 사실을 그림으로 강제.
- 인상적 디테일: NETMANIAS 는 인터널 헤더 (출력 포트 + next hop 주소) 를 패킷 앞에 붙이는 그림이 따로 — "라우터가 자기 안에서 임시 라벨을 붙여 스위치 모듈로 보낸다" 는 하드웨어 디테일이 한국어로 풀린다. 첼시팬은 "기본 게이트웨이가 곧 첫 hop" 임을 강조.
- 약점: 정적 박스 다이어그램 위주. 인터랙션 / 운동 부재. 다중 라우터 사이의 hop-by-hop 시퀀스는 글로 흩어져 있어 한 컷에 안 보임. 한국어 자료 다수가 같은 NETMANIAS 도식을 인용·재배치하는 경향.

## 3. 공통 요소

거의 모든 레퍼런스가 공유하는 시각 언어:

1. **노드 + 링크 그래프** — 라우터 / AS / 호스트는 원 또는 박스, 사이는 직선 / 곡선. 거의 절대 규칙. (R2~R10)
2. **패킷 = 작은 봉투 또는 색 점** — 노드 사이 선을 따라 미끄러지는 단위. 색 / 라벨로 발행자 / 목적지 / 타입을 구분. (R3, R4, R5, R7, R9)
3. **출발지·목적지 호스트 강조** — 좌측 또는 한쪽 끝에 "Source" 호스트, 반대쪽 또는 멀리 "Destination" 호스트가 색 / 아이콘 차이로 부각. (R3, R5, R7, R9, R10)
4. **라우팅 테이블 = 표** — prefix · next-hop · interface 컬럼의 텍스트 표. 라우터 박스 옆 또는 안에 배치. (R1, R3, R4, R10)
5. **hop = 노드 사이 한 걸음** — 패킷 동선이 노드를 차례로 지나며 hop 수를 그래프 거리로 환산. (R2, R3, R5, R7)
6. **단방향 화살표 (출발 → 목적)** — 응답 / 양방향 흐름은 부재 또는 별도. 본 흐름은 단방향 데이터 평면. (전 레퍼런스)
7. **지리 또는 토폴로지 좌표** — 노드 배치는 force-directed 그래프 (R6, R8) 또는 지구 좌표 (R7, R8) 또는 사용자가 그린 토폴로지 (R3, R4, R5).
8. **인터랙션 = 속도 슬라이더 + 일시정지 + Capture/Forward** — 인터랙티브 자료는 거의 모두 시간 컨트롤을 학습자에게 위임. (R3, R4, R5, R6)
9. **헤더 펼침** — 패킷을 클릭하면 IP / MAC 헤더의 src·dst 필드가 표로 펼쳐지는 패턴. (R3, R9)
10. **AS / 라우터 라벨링** — 노드 위에 AS 번호 또는 라우터 이름 (R1, R2, R3) 이 텍스트로 붙음.

학습자에게 형성된 기대:
- IP 라우팅은 노드 + 링크 그래프 위에서 패킷이 한 hop 씩 미끄러지는 운동이다.
- 각 라우터는 자기만의 표를 갖고 있고, 표를 읽어 다음 노드를 결정한다.
- 출발과 목적지가 있고, 그 사이에 여러 라우터가 끼어 있다.
- 시간은 hop 사이 이동으로 진행된다.

## 4. 공백

기존 레퍼런스에서 약하거나 비어있는 영역:

1. **longest prefix match 의 운동형 시각** — R1 이 단발 결정만, 나머지는 표 텍스트로만 보여준다. **여러 prefix 행이 동시에 비교되며 가장 긴 일치가 하이라이트되는 운동** (비트 단위 매칭이 점진적으로 진해짐) 이 거의 부재. 라우팅 테이블의 lookup 자체가 시간 사건으로 안 그려짐.
2. **TTL 감소의 사건성** — TTL 은 헤더 텍스트 필드로 표현될 뿐, 라우터를 통과할 때마다 시각적으로 한 단위 줄어드는 운동 (숫자 카운트다운 / 게이지 줄어듦) 이 거의 없다. TTL 0 폐기 사건도 "X 마크" 한 글자 수준. 패킷의 "수명" 이 시각으로 안 잡힘.
3. **hop-by-hop 결정의 독립성** — 거의 모든 도식이 "패킷이 미리 정해진 길을 따라간다" 는 인상을 준다. **각 라우터가 자기 표만 보고 독립으로 결정** 한다는 분산성 — 즉 도착하기 전까지 그 라우터의 next-hop 이 무엇일지 시스템 자체도 모른다는 사실 — 이 운동으로 강제되지 않음. R4 가 부분적으로 시도하지만 추상도가 높음.
4. **라우터의 시야 한계** — 라우터는 자기 인접 / 자기 표만 안다는 사실 (전역 토폴로지를 모름) 이 시각적으로 부재. 학습자는 "라우터가 전체 길을 본다" 는 오해를 가지기 쉬움. **라우터 박스 주변만 밝고 나머지는 어두운** 식의 시야 제한 표현이 거의 없다.
5. **다중 패킷 동시성 / 큐잉** — R5 가 부분적으로 큐를 그리지만, **같은 라우터에 여러 패킷이 동시에 도착해 차례로 처리되는** 운동이 표준 도식엔 없다. 라우터를 단일 패킷의 통과 지점으로만 그림.
6. **컨트롤 평면 vs 데이터 평면의 시각 분리** — R6 (BGPlay) 가 컨트롤 평면만, R3·R5·R7 이 데이터 평면만. 두 평면이 같은 도식 위에서 다른 색 / 다른 레이어로 동시에 보이는 자료가 거의 없다. "라우팅 정보가 흐르는 시간" 과 "패킷이 흐르는 시간" 이 직교한다는 점이 약함.
7. **다중 경로 / asymmetric routing** — 표준 도식은 "한 패킷, 한 길" 만 그린다. R7 traceroute 에서 우연히 발견될 뿐, **같은 출발-도착 사이 두 패킷이 다른 길** 로 가는 운동이 의도적으로 시각화된 자료가 드물다.
8. **prefix 매칭의 비트 시각** — 32비트 IPv4 주소가 prefix 와 비트 단위로 매칭되는 운동 (이진수 정렬 / 비교 / 일치 길이 측정) 이 거의 없다. R1 의 8비트 단순화 외에는 학습자가 "왜 longest 가 이기는가" 를 비트로 안 본다.
9. **next-hop 결정의 결과물성** — 라우팅 테이블 조회 결과 (next-hop 주소 + 출력 인터페이스) 가 패킷에 임시로 부착되는 사실 (R10 의 인터널 헤더) 이 학습자 눈에 거의 안 보인다. 결정과 송신 사이의 짧은 간격이 시각적으로 압축됨.
10. **실패 사건의 시각** — TTL 0 폐기, 큐 오버플로 폐기, no-route 폐기, ARP 실패 등 라우팅 도중 사라지는 사건들이 시각으로 거의 부재. 성공 시나리오만 그려짐.

## 5. 대상 개념 요약

> IP 라우팅은 출발지 호스트가 만든 한 패킷이 인터넷 위 여러 라우터를 거쳐 목적지 호스트에 도달하기까지의 hop-by-hop 분산 결정 과정이다. 각 라우터는 자기만의 라우팅 테이블 (forwarding table) 만 보고, 패킷의 목적지 IP 와 longest prefix match 로 next-hop 과 출력 인터페이스를 결정한 뒤 한 걸음만 보낸다. 패킷은 매 hop 마다 TTL 이 1 씩 줄고, 0 이 되면 폐기된다. 어느 라우터도 전역 길을 알지 못하며, 길은 각자의 표가 만든 결정의 연속으로 사후에 형성된다 — 이 점이 IP 라우팅의 시스템 행동 정체성이다.

학습자가 시각화와 함께 읽을 짧은 캡션:
- "이 라우터는 자기 표만 본다." (지역성)
- "가장 긴 일치가 이긴다." (longest prefix match)
- "한 hop 마다 TTL 이 한 칸 줄어든다." (수명)
- "다음 hop 만 정한다 — 그 다음은 다음 라우터의 일." (hop-by-hop 분산)
- "표가 없으면 패킷은 사라진다." (실패 사건)

용어 풀어쓰기:
- 패킷 → "헤더 + 페이로드의 한 묶음. 헤더에 목적지 IP 와 TTL 이 적혀 있다"
- 라우터 → "패킷을 받아 자기 표만 보고 다음 한 걸음을 결정해 보내는 노드"
- 라우팅 테이블 / forwarding table (FIB) → "prefix 와 next-hop·출력 인터페이스의 짝 목록. 라우터의 시야 전부"
- next-hop → "이 라우터가 보낸 패킷이 도착할 바로 다음 라우터의 주소"
- prefix → "IP 주소의 앞쪽 N 비트. 같은 prefix 면 같은 방향으로 보낸다"
- longest prefix match → "여러 prefix 가 매칭될 때 가장 긴 (가장 구체적인) 것을 고르는 규칙"
- hop → "라우터 사이 한 걸음. 그래프 위 한 변"
- TTL (Time To Live) → "패킷에 적힌 잔여 hop 수. 매 hop 1 씩 줄고 0 이면 폐기"
- 데이터 평면 / forwarding → "실제 패킷이 흐르는 면. 본 facet 의 베이스"
- 컨트롤 평면 / routing → "라우팅 테이블을 만들고 갱신하는 면 (RIP·OSPF·BGP). 본 facet 의 보조 영역"
- AS (Autonomous System) → "한 운영 주체가 관리하는 라우터 묶음. BGP 의 단위"
- ARP → "같은 LAN 안에서 IP 주소를 MAC 주소로 바꾸는 보조 절차. L3 결정 후 L2 송신 직전 일어남"

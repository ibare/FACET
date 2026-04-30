# IP 라우팅 분류

도메인 prefix 결정: 후보는 `networking` / `computer-network` / `network-layer` / `network` 였다. 이미 같은 도메인의 다른 자료가 `network-ip-routing-*` 형태로 존재하며, 향후 TCP·DNS·ARP 등 같은 군의 facet 이 합류할 때 너무 좁은 `network-layer` 보다 한 단계 위인 `network` 가 응집도와 확장성이 균형 잡혀 있다. 따라서 `network` 를 prefix 로 채택한다.

베이스 범위 메모: 본 facet 의 베이스 시각화는 데이터 평면 (forwarding) 으로 둔다. 컨트롤 평면 (라우팅 프로토콜) 은 보조 또는 공백 후보로 미루며, 깊은 결정은 essence 단계로 넘긴다.

## 1. 대상 정보

- 이름: IP 라우팅 (IP routing)
- 분야: 컴퓨터 네트워크 / 네트워크 계층 (Layer 3)
- 핵심 참여자: 출발지 호스트, 라우터, 목적지 호스트, 라우팅 테이블, 패킷 (헤더에 목적지 IP·TTL)
- 핵심 사건: 패킷 도착, 라우팅 테이블 조회 (longest prefix match), next-hop 결정, TTL 1 감소, 다음 라우터로 전송, 목적지 도달 또는 TTL 0 폐기
- 특성: hop-by-hop 분산 결정, 각 라우터는 지역 정보만으로 다음 한 걸음만 결정

## 2. type

systemBehavior

근거: 한 패킷의 절차로만 보면 procedure 도 가능하나, 학습 가치는 여러 라우터가 서로 다른 라우팅 테이블을 갖고 같은 시간 위에서 패킷을 분산 처리하는 시스템 행동에 있다. longest prefix match 는 내부 알고리즘일 뿐 시각화의 중심은 패킷의 운동이다.

## 3. 진행 모델

메시지 시퀀스형

근거: 라우터들 사이를 hop 단위로 흐르는 패킷의 순서가 본질이다. 입력 반응형 (목적지 IP 입력) 은 트리거에 가깝고, 본 흐름은 시간 축 위 메시지 시퀀스로 가장 자연스럽게 표현된다.

## 4. 핵심 학습 질문

한 패킷이 어떻게 각 라우터의 라우팅 테이블 조회와 next-hop 결정만으로 출발지에서 목적지까지 hop-by-hop 으로 길을 찾아가는가?

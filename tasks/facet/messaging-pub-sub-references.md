# Pub/Sub 시각화 레퍼런스 분석

> 분류 보고서 결과: type=systemBehavior, 진행 모델=메시지 시퀀스형, 도메인=messaging. 핵심 학습 질문=발행자와 구독자가 서로를 모르는 채로 토픽을 매개로 메시지가 어떻게 다대다 비동기로 전달되는가. 표준 패턴 도식·메시지 브로커 공식 자료·인터랙티브 시뮬레이션·메타포 일러스트·한국어 자료·인접 패턴(Observer) 까지 시각 언어를 폭넓게 수집.

## 1. 검색 결과

총 10개 레퍼런스를 수집했다. 표준 패턴 도식 3건(Enterprise Integration Patterns, Microsoft Azure, AWS), 인터랙티브 시뮬레이션 2건(Aiven Kafka, SoftwareMill Kafka), 브로커 공식·해설 2건(RabbitMQ Fanout / CloudAMQP, Redis Pub/Sub & HiveMQ MQTT 비교), 한국어 자료 2건(우아한형제들 카프카, 위키백과 발행-구독 모델 + 한국어 블로그), 인접 패턴 1건(GoF Observer UML / Refactoring.guru). 같은 "Publisher → Broker → Subscriber" 삼각 구조 위에서도 도식이 강조하는 축(팬아웃 분기 / 토픽 격리 / 시간 디커플링 / 메시지 사본) 이 다르게 펼쳐지므로 각 레퍼런스마다 그 차이를 별도로 짚었다.

검색어:
- 영어: "publish subscribe pattern visualization Enterprise Integration Patterns", "kafka topic partition visualization animation interactive", "redis pub sub diagram fan out", "rabbitmq exchange fanout queue diagram", "ByteByteGo pub sub messaging system", "Google Cloud Pub Sub architecture diagram", "MQTT pub sub demo broker visualization", "NATS messaging visualization", "observer pattern UML sequence diagram GoF", "newspaper radio analogy publish subscribe pattern"
- 한국어: "발행 구독 패턴 Pub/Sub 시각화 다이어그램", "우아한형제들 카카오 네이버 카프카 메시지 큐 기술 블로그"

## 2. 레퍼런스 요약

### R1. Enterprise Integration Patterns — Publish-Subscribe Channel

- 출처: enterpriseintegrationpatterns.com (Gregor Hohpe·Bobby Woolf, EAI 패턴의 정전(正典))
- URL: https://www.enterpriseintegrationpatterns.com/patterns/messaging/PublishSubscribeChannel.html
- 한 줄 정체성: "한 입력 채널이 여러 출력 채널로 분기" 라는 가장 단순한 팬아웃 도식. 모든 후속 자료가 인용하는 표준 시각.
- 시각 객체: 좌측 Sender 박스 → 입력 채널(파이프 모양) → 가운데 채널 분기점(둥근 분배기 아이콘) → 출력 채널 N개 → 우측 Receiver 박스 N개. 화살표는 항상 단방향 좌→우.
- 시간 표현: 정적 도식. 한 메시지의 사본이 동시에 모든 출력 채널로 복제되는 "한순간의 분배" 만 그림.
- 메타포: "수도관 분기" — 입력 파이프가 여러 출력 파이프로 갈라지는 배관 그림. 메시지 = 흘러가는 물.
- 강조: 메시지가 **복제되어** 각 구독자에게 한 사본씩 간다는 사실. 입력 채널과 출력 채널의 분리.
- 인상적 디테일: 채널 자체를 1급 객체로 그린다. Publisher-Subscriber 가 아니라 "채널" 이 패턴 이름이라는 점이 시각으로 강제됨.
- 약점: 시간 디커플링·구독 합류·이탈·백프레셔는 전혀 없음. "동시에 모두에게" 라는 이상화된 동기 그림.

### R2. Microsoft Azure Architecture Center — Publisher-Subscriber Pattern

- 출처: learn.microsoft.com (Azure Well-Architected Framework 패턴 카탈로그)
- URL: https://learn.microsoke-pubsub-pattern (실제: https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber)
- 한 줄 정체성: EIP 의 분기 도식을 "broker" 박스 하나로 흡수해 더 단순화한 클라우드 시대 표준 도식.
- 시각 객체: 좌측 Publisher 박스 1개 → 화살표 → input channel → message broker(가운데 큰 박스) → output channel → 우측 Subscriber 3개. 모두 평면 사각형 + 단색 화살표.
- 시간 표현: 정적. 메시지 1개가 broker 안에서 복제되어 3개 구독자로 동시 출력되는 한 컷.
- 메타포: 우편 분류소(broker = 사서함). publisher 는 보내고 broker 가 적절한 구독자 사서함에 넣어둠.
- 강조: **broker 가 구독자가 오프라인이어도 메시지를 보관** 한다는 사실(텍스트 + 도식 결합). publisher 와 subscriber 가 broker 만 알면 된다는 디커플링.
- 인상적 디테일: 같은 페이지 끝의 "enterprise integration" 예시는 Service Bus + Event Grid 두 broker 가 공존하는 복합 아키텍처를 운반 — 즉, 단일 broker 도식이 실제로는 다중 broker 토폴로지로 확장됨을 함의.
- 약점: 단일 토픽·단일 메시지 시나리오만. 토픽 격리·구독자 동적 합류·메시지 순서·중복 전달 같은 운영 이슈는 본문 텍스트로만 다뤄지고 도식 부재.

### R3. AWS — What is Pub/Sub Messaging? & Implementing EIP with AWS Messaging Services

- 출처: aws.amazon.com (AWS Messaging 공식 해설 + AWS Compute 블로그)
- URL: https://aws.amazon.com/what-is/pub-sub-messaging/ , https://aws.amazon.com/blogs/compute/implementing-enterprise-integration-patterns-with-aws-messaging-services-publish-subscribe-channels/
- 한 줄 정체성: SNS(토픽) → SQS(큐) "팬아웃" 을 두 단계 박스로 그려 "토픽 = 분기점, 큐 = 구독자별 보관함" 을 명시한 클라우드 사업자 도식.
- 시각 객체: Publisher 박스 → SNS topic 박스(원형 + 주황) → 화살표 N개 → SQS queue 박스 N개(각각 보관함 모양) → Subscriber/Lambda 아이콘 N개. AWS 제품 아이콘 스타일.
- 시간 표현: 정적이지만 두 단계로 시간성을 분해 — "토픽 도착" 과 "큐에서 소비" 가 다른 시점임을 두 박스 사이의 거리로 표현.
- 메타포: 사서함 분배. SNS = 우체국 분류, SQS = 각 구독자의 우편함.
- 강조: **토픽과 큐를 분리** 해서 "메시지 분배" 와 "메시지 보관" 을 다른 객체로 그린다. 시간 디커플링이 도식 위에 자연스럽게 등장.
- 인상적 디테일: 큐 박스 안에 메시지 여러 개를 작은 사각형으로 쌓아 보여줘 "구독자가 못 와도 메시지가 기다린다" 를 시각화. 미수신·지연 처리가 도식에 들어옴.
- 약점: AWS 제품 종속 시각이라 "패턴" 보다 "제품" 이 먼저 학습됨. 토픽 격리·다중 토픽 라우팅 비교는 약함.

### R4. Aiven — Kafka Visualization Tool

- 출처: aiven.io (관리형 Kafka 사업자의 인터랙티브 학습 도구)
- URL: https://aiven.io/tools/kafka-visualization
- 한 줄 정체성: 프로듀서·브로커·컨슈머·복제본을 한 화면에서 운동으로 흘려보내며 "팔로워 복제본은 흐릿하게" 같은 색·투명도 약속을 동원한 본격 인터랙티브 시뮬레이션.
- 시각 객체: 좌측 Producer 박스 → 가운데 Broker 클러스터(3~5개 박스 격자) → 우측 Consumer 박스(그룹 A/B/C 별 색 구분). 각 메시지는 작은 색 칩으로 화살표를 따라 흐르고, 팔로워 복제본은 같은 칩의 **반투명** 버전.
- 시간 표현: Restart / Animation Speed (Slow/Normal/Fast). 일시정지 가능. 메시지 발행에서 컨슈머 수신까지 한 사건이 운동으로 연속.
- 메타포: 공장 컨베이어. 메시지 = 부품, 브로커 = 작업장, 컨슈머 = 픽업하는 라인.
- 강조: **복제본의 시각적 차등** (원본 = 진한 색, 팔로워 = 흐림) 으로 "같은 메시지가 여러 곳에 있다" 를 명시. 컨슈머 그룹별 색으로 격리 표현.
- 인상적 디테일: 속도 슬라이더로 같은 시나리오를 빠르게/느리게 반복 관찰 가능 — 학습자가 자기 호흡으로 동기·비동기 감각을 잡는다.
- 약점: 단일 토픽 가정으로 단순화되어 토픽 격리·다중 토픽 라우팅이 도식에 부재. 동적 구독 합류·이탈도 약함.

### R5. SoftwareMill — Kafka Visualization

- 출처: softwaremill.com (스칼라/카프카 컨설팅 회사의 교육용 인터랙티브)
- URL: https://softwaremill.com/kafka-visualisation/
- 한 줄 정체성: 파티션·복제 계수·브로커 장애 토글까지 운영 시나리오를 시뮬레이션하는 "교실용 Kafka 운영 sandbox".
- 시각 객체: Producer(P) 박스 → 가운데 Broker 격자(브로커마다 파티션 슬롯이 줄지어 있는 표) → Consumer Group A 박스. 메시지가 파티션 슬롯 안에 누적되며 컨슈머 오프셋 마커가 슬라이딩.
- 시간 표현: 5초~1초 사이 속도 조절, 일시정지/재시작. 사용자가 broker 를 클릭으로 종료/복구하면 즉시 리밸런싱 운동.
- 메타포: 도서관 책꽂이. 파티션 = 칸막이 책장, 오프셋 = 읽은 데까지의 책갈피.
- 강조: **파티션 단위 순서 보장** 을 슬롯 정렬로 시각화. 브로커 장애 시 팔로워가 리더로 승격되는 운동이 한 사건으로 펼쳐짐.
- 인상적 디테일: 컨슈머 오프셋이 파티션 위를 천천히 미끄러지는 모습 — "어디까지 읽었는지" 가 1차원 진행도로 직접 보임. Pub/Sub 의 정체성을 "다대다 팬아웃" 보다 "재생 가능한 로그" 쪽으로 끌고 가는 시각.
- 약점: Kafka 특유의 로그 모델에 강하게 묶여 있어 일반 Pub/Sub(즉시 전달, 보관 없음) 의 시각으로는 과도. publisher–subscriber 의 비대칭 시간감이 흐려짐.

### R6. RabbitMQ / CloudAMQP — Fanout Exchange

- 출처: rabbitmq.com 공식 튜토리얼 + cloudamqp.com 해설
- URL: https://www.rabbitmq.com/tutorials/amqp-concepts , https://www.cloudamqp.com/blog/rabbitmq-fanout-exchange-explained.html
- 한 줄 정체성: AMQP 의 "exchange → binding → queue → consumer" 4단 박스로 라우팅 단계를 분해해 보여주는 정전 도식.
- 시각 객체: Producer → Exchange(둥근 X 마크 박스) → 여러 binding 선 → Queue 박스 N개(가로 셀이 줄지어 메시지 누적) → Consumer 박스 N개. fanout 은 routing key 가 비어 있는 점을 X 박스 위 라벨로 명시.
- 시간 표현: 정적 다이어그램이 다수. 일부 튜토리얼에 GIF 로 메시지가 X → 모든 큐로 갈라지는 짧은 운동.
- 메타포: 분배기(fanout) — 한 입력이 모든 라인으로 동시 분기. 라우팅 키 매칭이 있는 direct/topic exchange 와 한 도식 안에서 비교됨.
- 강조: **exchange 와 queue 의 분리** — "broker 안에 두 종류의 객체가 있다" 는 사실. fanout / direct / topic / headers 를 같은 박스 모양으로 토글하며 비교 가능.
- 인상적 디테일: 라우팅 키 라벨이 화살표 위에 붙어 있어 "어떤 키로 매칭됐는가" 가 사건성을 가진다. fanout 은 이 라벨이 비어 있다는 사실 자체로 "조건 없는 분기" 를 시각화.
- 약점: 4단 박스가 학습자에게 인지 부하를 준다. AMQP 모델이 익숙하지 않으면 exchange 와 queue 의 차이가 체감되지 않음. 시간 디커플링은 큐 박스 안 누적 메시지로만 약하게 표현.

### R7. Redis Pub/Sub & HiveMQ MQTT — Fan-out Only Pub/Sub

- 출처: redis.io 공식 + medium.com Redis with Raphael De Lio + hivemq.com MQTT Essentials
- URL: https://redis.io/glossary/pub-sub/ , https://medium.com/redis-with-raphael-de-lio/understanding-pub-sub-in-redis-18278440c2a9 , https://www.hivemq.com/blog/mqtt-essentials-part2-publish-subscribe/
- 한 줄 정체성: "보관 없음, 동시 접속 필수" 라는 가장 순수한 fire-and-forget 팬아웃을 ASCII 박스 + 채널 라벨로 그리는 미니멀 도식. MQTT 는 같은 모델을 IoT 토픽 트리로 확장.
- 시각 객체: 좌측 Publisher 2~3개 → 가운데 Server/Broker 박스(채널명 라벨 "events" / "sensor/temp") → 우측 Subscriber 2~3개. ASCII 또는 평면 사각형, 화살표는 단방향. MQTT 는 토픽이 슬래시로 계층화된 트리 라벨.
- 시간 표현: 정적. 일부 해설은 "구독자가 없으면 메시지가 사라진다" 를 강조하기 위해 "X" 마크로 사라지는 사건을 추가.
- 메타포: 라디오 방송. 채널을 맞춘 사람만 듣고, 끄고 있던 사람은 영원히 못 듣는다.
- 강조: **at-most-once + 비보관** — 송수신 동시 접속이 필수라는 약속이 도식의 핵심. 메시지가 broker 를 통과만 하고 머무르지 않음. MQTT 는 토픽 계층 구조를 트리로 시각화.
- 인상적 디테일: Redis 도식은 거의 모든 자료에서 ASCII 로 그려져 학습자가 "단순하다" 는 인상을 즉시 받는다. MQTT 는 `home/livingroom/temperature` 같은 토픽 트리로 와일드카드 구독을 라벨로 표현.
- 약점: 보관 없음의 "위험성" 이 정적 그림으로는 약함. 미수신 구독자가 받지 못하는 메시지가 시각적 사건으로 안 보임. 백프레셔·재전송 부재.

### R8. GoF Observer / Refactoring.guru — UML 시퀀스 다이어그램

- 출처: en.wikipedia.org/wiki/Observer_pattern + refactoring.guru
- URL: https://en.wikipedia.org/wiki/Observer_pattern , https://refactoring.guru/design-patterns/observer
- 한 줄 정체성: Pub/Sub 의 객체지향 사촌. 같은 발행-구독 의미를 **세로 시간축 + 객체별 라이프라인** 으로 그리는 UML 시퀀스 도식.
- 시각 객체: 위쪽에 Subject·Observer1·Observer2 박스가 가로로 늘어서고, 각자 아래로 점선 라이프라인. 시간은 위→아래로 흐르며 attach() / notify() / update() 호출이 가로 화살표로 박스 사이를 오감.
- 시간 표현: **세로 시간축** — Pub/Sub 도식들 중 거의 유일하게 시간을 1급 시각 차원으로 끌어올림. 호출 순서(구독 → 상태 변화 → 통지) 가 위→아래로 명시.
- 메타포: "구독한 사람들에게 차례로 알리기" — broker 없는 직접 호출. 일러스트는 refactoring.guru 의 "신문 구독" 그림(우편함에 신문이 떨어지는 손그림) 으로 보강.
- 강조: 구독·통지·해지의 시간 순서. "Subject 가 모든 Observer 의 update() 를 차례로 부른다" 는 사실이 시간축 위에서 직접 보임.
- 인상적 디테일: refactoring.guru 의 신문 구독 일러스트는 publisher = 신문사, subscriber = 우편함이라는 일상 비유를 강력하게 운반. 같은 페이지에 클래스 다이어그램과 손그림이 공존.
- 약점: 직접 호출 모델이라 broker 부재. 토픽·팬아웃·비동기·시간 디커플링이 모두 빠진다. Pub/Sub 의 "익명성" 이 약하게 표현 — Subject 가 Observer 목록을 직접 알기 때문.

### R9. 우아한형제들 기술 블로그 — 우리 팀은 카프카를 어떻게 사용하고 있을까

- 출처: techblog.woowahan.com (우아한형제들 주문 도메인 팀의 카프카 운영 사례)
- URL: https://techblog.woowahan.com/17386/
- 한 줄 정체성: 한국어 실무 사례로 "주문 → 카프카 토픽 → 다중 컨슈머 도메인" 의 팬아웃과 "트랜잭셔널 아웃박스 → 카프카" 의 시간 디커플링을 박스 다이어그램으로 풀어쓴 글.
- 시각 객체: 정적 박스+화살표 다이어그램 다수. 좌측 도메인 서비스(주문) → outbox 테이블(여러 개) → Debezium → Kafka 토픽 → 우측 컨슈머 도메인(배달, 정산, 알림 등). 토픽은 가로로 누운 로그 모양.
- 시간 표현: 정적. 단계별 다이어그램이 글의 흐름을 따라 순서대로 등장.
- 메타포: "추가만 가능한 시간순 로그" — 카프카를 강·강물처럼 흘러가는 단방향 기록물로 비유.
- 강조: **트랜잭션 경계와 메시지 발행의 분리** — DB 커밋 후에 메시지가 안전하게 발행되는 패턴(Outbox) 이 구조도로 정당화됨. 컨슈머마다 다른 도메인이 같은 토픽을 구독한다는 다대다 팬아웃을 실제 비즈니스 박스 이름으로 채움.
- 인상적 디테일: outbox 테이블을 여러 개로 분할한 그림 — 처리량 확보 전략이 시각으로 드러남. 한국어 학습자가 "왜 단순 publish 호출로 안 되는가" 를 실무 맥락에서 마주치는 거의 유일한 자료.
- 약점: 정적 그림. 인터랙션·운동성 부재. 다대다 팬아웃의 동시성 감각은 박스로만 표현되어 약함. 토픽 격리·구독자 동적 합류는 본문 텍스트로 흐림.

### R10. 한국어 위키백과 — 발행-구독 모델 / Velog · 7ULY 블로그 정리

- 출처: ko.wikipedia.org/wiki/발행-구독_모델 + chanhohan.github.io/posts/publish-subscribe-pattern + velog.io/@onedanbee/Observer-패턴과-Pubsub-패턴
- URL: https://ko.wikipedia.org/wiki/%EB%B0%9C%ED%96%89-%EA%B5%AC%EB%8F%85_%EB%AA%A8%EB%8D%B8 , https://chanhohan.github.io/posts/publish-subscribe-pattern/ , https://velog.io/@onedanbee/Observer-%ED%8C%A8%ED%84%B4%EA%B3%BC-Pubsub-%ED%8C%A8%ED%84%B4%EC%97%90-%EB%8C%80%ED%95%B4%EC%84%9C-0sle4bee
- 한 줄 정체성: 한국어권에서 "Publisher → Topic/Channel → Subscriber" 삼각 구조의 시각 관습을 정착시킨 자료군. Observer 와의 차이("broker 가 끼어 있다") 를 박스 한 개의 추가로 그려 비교.
- 시각 객체: 위키백과는 SVG 1장 — Publisher → Event Channel → Subscriber 의 단순 선형 도식 + 다중 구독자 분기. Velog/7ULY 글은 손그림풍 박스 + 화살표, Observer vs Pub-Sub 비교 도식.
- 시간 표현: 정적 그림 1~2장. 한국어 글들은 "구독 → 발행 → 전달" 의 텍스트 단계 설명으로 시간성을 보충.
- 메타포: 우편 사서함, 신문 구독, 라디오 방송. 한국어 번역어 "발행/구독" 자체가 이미 출판 비유를 강제.
- 강조: **Observer 와의 결정적 차이** — Pub/Sub 은 publisher 와 subscriber 사이에 broker 가 있어 서로를 모른다는 사실. 비교 도식이 두 패턴을 나란히 두고 broker 박스의 유무로 차이를 강조.
- 인상적 디테일: 위키백과 SVG 의 화살표가 publisher → channel 1개, channel → subscriber N개 로 비대칭 — "한 번 발행, 여러 사본" 이 화살표 수의 비대칭으로 직접 보임. 한국어 블로그들은 "신문사–우편함" 비유를 일관되게 사용.
- 약점: 정적 단일 그림. 인터랙션·시간 디커플링·동적 구독 운동 부재. 대부분 글이 같은 단순 도식을 반복해 학습자가 "다른 시각" 을 만나기 어렵다.

## 3. 공통 요소

거의 모든 레퍼런스가 공유하는 시각 언어:

1. **좌·중·우 삼각 배치** — 좌측 Publisher, 가운데 Broker/Topic/Channel, 우측 Subscriber 의 3분할 가로 레이아웃. 거의 절대 규칙. (전 레퍼런스)
2. **단방향 좌→우 화살표** — 메시지가 publisher 에서 subscriber 로 흐른다는 시각. 응답 화살표는 부재(요청-응답이 아닌 단방향이라는 약속). (전 레퍼런스)
3. **팬아웃 분기** — 가운데 broker 에서 N개의 화살표가 부채꼴로 펼쳐져 N개 subscriber 로 도달. 한 메시지의 사본 N개를 화살표 수의 곱셈으로 표현. (R1, R2, R3, R6, R7, R10)
4. **broker 가 1급 박스** — publisher 와 subscriber 가 서로를 모른다는 사실이 가운데 broker 박스의 존재로 강제됨. Observer(R8) 만이 이 박스를 생략하고 직접 호출로 그림. (R1~R7, R9, R10)
5. **토픽/채널 라벨** — broker 박스 안 또는 위에 "topic name" 텍스트 라벨. fanout 은 라벨이 비어 있거나 와일드카드(R6, R7-MQTT). 라벨로 라우팅을 표현. (R2, R3, R6, R7, R9, R10)
6. **메시지 = 색 칩 또는 작은 사각형** — 인터랙티브 도구에서 메시지를 broker 와 화살표 위를 따라 움직이는 작은 단위로 표현. 색은 토픽/그룹/원본-복제본을 구분. (R4, R5)
7. **큐/슬롯의 누적 표현** — broker 또는 subscriber 측 큐에 메시지가 쌓인 모습을 작은 사각형 줄로 보여 시간 디커플링을 함의. (R3, R4, R5, R6)
8. **인터랙션 = 속도 슬라이더 + 일시정지** — 인터랙티브 자료는 거의 모두 Animation Speed + Pause + Restart 3종 컨트롤로 시간을 학습자 손에 쥐여줌. (R4, R5)

학습자에게 형성된 기대:
- Pub/Sub 은 좌→우 가로 흐름이다.
- 가운데에 무언가(broker / topic / channel) 가 끼어 있고, 그 무언가가 한 메시지를 N개로 복제해 뿌린다.
- publisher 와 subscriber 는 broker 만 알면 된다 — 서로는 익명.
- 토픽 이름이 라우팅을 결정한다.

## 4. 공백

기존 레퍼런스에서 약하거나 비어있는 영역:

1. **두 시간축의 직교 배치** — Pub/Sub 의 핵심은 "발행 시각" 과 "구독자별 수신 시각" 이 다르다는 비대칭이지만, 대부분 도식이 가로 한 축에 모든 시간을 압축한다. R8(UML 시퀀스) 만이 세로 시간축을 도입했고 거기엔 broker 가 없다. **broker 가 있는 도식 + 세로 시간축** 의 결합은 거의 부재.
2. **구독자의 동적 합류·이탈 운동** — 거의 모든 도식이 "고정된 N명의 구독자" 를 그린다. 새 구독자가 도중에 들어오고, 기존 구독자가 빠져나가는 운동이 시각적 사건으로 등장하는 자료가 드물다. 동적 토폴로지가 정체성인 패턴인데 그림은 정적.
3. **미수신 구독자의 사건성** — 오프라인 구독자가 메시지를 못 받는 사건(R7 의 fire-and-forget) 이 X 마크 한 글자로만 표현되거나 아예 안 그려진다. "이 구독자는 이 메시지를 영영 못 본다" 는 정서적 시각이 약하다. 거꾸로 보관형(R3 SQS, R5 Kafka) 에서 "기다리는 메시지의 답답함" 도 단순 누적 사각형으로만.
4. **메시지 정체성 보존 vs 사본** — 한 메시지가 N명에게 갈 때 "같은 메시지인가, 사본인가" 의 시각적 약속이 흔들린다. R4 의 투명도 차등(원본/복제본) 외에는 색·번호·해시 등으로 정체성을 추적한 사례가 드물다. 같은 색 칩 N개가 갈라지는 것만으로는 "사본" 이 충분히 안 보임.
5. **fanout vs 라운드로빈의 시각 대비** — Pub/Sub 의 팬아웃과 메시지 큐의 라운드로빈(competing consumers) 이 같은 broker 박스 위에서 어떻게 다르게 그려져야 하는지가 약하다. R6 의 exchange 종류 비교가 부분적으로 시도하지만, 같은 입력 시퀀스를 두 모드에 동시에 흘려 보내는 운동형 비교는 부재.
6. **토픽 격리** — 다중 토픽이 같은 broker 안에서 어떻게 격리되는지가 라벨 텍스트로만 표현된다. 토픽별로 색 영역·박스 분할·슬롯 분리 등으로 "이 메시지는 이 토픽에만 산다" 를 시각으로 강제한 자료가 드물다(R5 의 파티션 슬롯이 부분적 시도).
7. **at-least-once · at-most-once · exactly-once 의 시각화** — R2 의 본문 텍스트로만 다뤄지고 도식 부재. 같은 도식 위에서 보장 수준이 바뀌면 무엇이 달라지는가(중복 칩 등장, 손실 칩 사라짐, 중복 제거 X 마크) 가 운동으로 안 보인다.
8. **백프레셔와 미처리 누적** — 구독자가 못 따라잡을 때 broker 안에 메시지가 쌓이는 압박이 R5 의 오프셋 외에는 거의 없다. "broker 가 답답해진다" 는 정서적 시각이 부재.
9. **"서로를 모른다" 의 시각적 강제** — Pub/Sub 의 정체성인 익명성이 broker 박스의 존재로만 함의될 뿐, publisher 와 subscriber 사이에 가시적 차단(불투명 벽, 점선 영역, 분리된 색 영역) 으로 강제된 자료가 거의 없다. R8 의 Observer 와 비교했을 때 이 익명성이 시각적으로 부각되지 않는다.
10. **"다대다" 의 양방향성** — 대부분 도식은 publisher 1 → subscriber N(팬아웃) 만 그리지만, 실제 Pub/Sub 은 publisher M → topic → subscriber N(M 도 1보다 큼) 의 다대다다. 다중 publisher 가 같은 토픽에 메시지를 섞어 쏘는 운동은 R4·R5 가 부분적으로 시도할 뿐 표준 도식에는 거의 없다.

## 5. 대상 개념 요약

> Pub/Sub 은 메시지를 주는 쪽(Publisher) 과 받는 쪽(Subscriber) 이 서로의 존재를 모른 채로, 가운데 자리한 **broker** 의 **토픽(또는 채널)** 만 알면 다대다 비동기 통신이 성립하도록 만든 메시징 패턴이다. publisher 가 토픽에 메시지를 발행하면 broker 가 그 토픽을 구독한 모든 subscriber 에게 메시지의 사본을 한 번씩 전달한다(팬아웃). publisher 와 subscriber 는 시간적으로 디커플링되어 서로의 가용성에 영향받지 않으며, 토픽이라는 라벨 한 줄이 라우팅을 결정한다. 이 단순한 약속이 동적 토폴로지·확장성·장애 격리·이벤트 기반 아키텍처 전반의 기반이 된다.

학습자가 시각화와 함께 읽을 짧은 캡션:
- "publisher 는 토픽에만 던진다." (익명 발행)
- "subscriber 는 토픽만 신청한다." (익명 구독)
- "broker 가 사이에서 사본을 뿌린다." (팬아웃)
- "받을 사람이 늦어도 broker 가 기다려 준다 — 또는 못 받은 채 사라진다." (시간 디커플링 / 보장 수준)
- "한 토픽, 여러 구독자, 서로 모름." (다대다 익명성)

용어 풀어쓰기:
- Publisher → "메시지를 만드는 쪽. 누가 받는지 모른다"
- Subscriber → "메시지를 받는 쪽. 누가 보냈는지 모른다"
- Broker → "사이에서 사본을 뿌리는 중간자. 양쪽이 유일하게 아는 존재"
- Topic / Channel → "broker 안의 라벨. 같은 토픽을 신청한 모두에게 메시지가 간다"
- Publish → "토픽에 메시지를 던지는 행위"
- Subscribe / Unsubscribe → "토픽 수신 신청 / 해지"
- Fan-out → "한 메시지가 모든 구독자에게 사본으로 펼쳐지는 운동"
- 시간 디커플링 → "보내는 시각과 받는 시각이 달라도 되는 약속"
- At-most-once / At-least-once / Exactly-once → "한 메시지가 잃거나 / 중복되거나 / 정확히 한 번 가는 보장 수준"
- 백프레셔 → "구독자가 못 따라잡을 때 broker 가 받는 압력"

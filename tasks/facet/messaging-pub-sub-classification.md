# Pub/Sub 분류

도메인 prefix 결정: 시스템 설계 안에서도 메시지 큐·메시징 패턴은 별도 하위군으로 묶이며, 추후 message-queue / event-bus 등 동류 facet 이 같은 군에 합류할 가능성이 높다. 따라서 더 좁고 응집도 높은 `messaging` 을 prefix 로 채택한다.

## 1. 대상 정보

- 이름: Pub/Sub (publish/subscribe)
- 분야: 시스템 설계 / 메시징 패턴
- 핵심 참여자: Publisher, Subscriber, Broker (Topic / Channel)
- 핵심 사건: subscribe, unsubscribe, publish, fan-out, deliver
- 특성: 다대다 팬아웃, 발행자·구독자 간 느슨한 결합, 비동기 푸시 의미

## 2. type

systemBehavior

근거: 단일 절차나 자료 구조가 아니라 다중 참여자가 시간 위에서 메시지로 상호작용하는 시스템 행동에 가장 잘 들어맞는다. protocol 후보도 있었으나, 메시지 규약 자체보다 참여자 간의 동적 행동을 보여주는 데 학습 가치가 있다.

## 3. 진행 모델

메시지 시퀀스형

근거: 시간 축 위에서 참여자 사이를 오가는 메시지 (subscribe / publish / deliver) 의 순서가 학습의 본질을 이룬다.

## 4. 핵심 학습 질문

발행자와 구독자가 서로를 모르는 채로 토픽을 매개로 메시지가 어떻게 다대다로 비동기 전달되는가?

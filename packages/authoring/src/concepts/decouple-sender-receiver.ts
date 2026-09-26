/**
 * decoupleSenderReceiver 개념 선언.
 *
 * canonical facet 은 `facet:decoupleSenderReceiver` — 토픽 `price.changed` 에 구독자 후보 셋(장바구니 · 검색 · 알림)이
 * 들고 나는 사이 보내는 쪽이 가격 넷(1200 · 1150 · 1300 · 1250)을 발행한다. 받은 곳은 0 · 1 · 3 · 2 로 바뀌는데
 * 보내는 쪽이 아는 것은 네 번 모두 1(토픽 이름). 아무도 없을 때 나간 1200 은 토픽에서 버려진다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (있는 `messagingPubsub` 아래 조각 둘 중 하나)
 *
 * 움직이는 것은 **들고 나는 구독자**이고, 그 곁에 보내는 쪽이 아는 것(1)이 한 번도 움직이지 않는다. 사본이 갈라지는 것은
 * 한 걸음 안의 결과일 뿐이다. 주장은 "받는 쪽이 바뀌어도 보내는 쪽은 바뀌지 않는다" 하나다. 그래서 definition 은
 * join · leave · knows only the topic name · unchanged · at that moment · dropped 를 쥐고, 형제 `publishToMany` 의
 * one copy per subscriber · multiplied 를 쓰지 않는다. 완제품 `messagingPubsub` 개념 파일은 고치지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `decoupleSenderReceiver.md` 가 밝힌 것):
 *  - 보존이 없는 발행-구독 — 발행된 순간의 구독자에게만 간다 · 확인 응답 · 재전송 없음.
 *  - 탈퇴한 구독자가 이미 받은 사본은 남는다. 시각을 셈하지 않는다 — 발행 걸음에 보내기와 사본 넣기가 함께 일어난다.
 *  - 화면에 코드가 없다. "직접 부른다면 아는 주소가 0 → 1 → 2 → 3 → 2" 는 설명 글만의 견줌이고 화면에 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const decoupleSenderReceiverConcept: FacetConceptSource = {
  id: 'decoupleSenderReceiver',
  label: 'Loose Coupling: The Sender Knows Only the Topic',
  canonicalFacet: 'facet:decoupleSenderReceiver',

  surface: {
    definition:
      "A publisher that knows only a topic name stays unchanged as subscribers join and leave; each message reaches whoever is subscribed at that moment, or is dropped if nobody is.",
    exemplarKeywords: [
      'loose coupling',
      'decoupling producer and consumer',
      'add a new consumer without changing the producer',
      'producer does not know its consumers',
      'dynamic subscription',
      'subscribe and unsubscribe',
      'late subscriber misses earlier messages',
      'message dropped with no subscribers',
      'event-driven microservices',
      'direct call vs publish',
    ],
  },

  briefing: {
    observable: [
      'The sender on the left holds a single tag, `price.changed`, with "Knows: 1". The topic `price.changed` sits in the middle. Cart, Search and Alerts start in a "Not subscribed" area and move into the "Subscribers" area when they join.',
      'Step 1 publishes 1200 with no one subscribed: "Published: 1200. Reached: 0. Dropped at the topic."',
      'Subscribers join and leave one per step — "Joined: Cart. Subscribers: 1", later Search and Alerts, then "Left: Cart. Subscribers: 2" — while the sender, its tag and its arrow to the topic never change.',
      'Each publish sends a copy only to those subscribed at that moment: 1150 reaches Cart alone, 1300 reaches all three, 1250 reaches Search and Alerts. Search and Alerts never receive 1150, published before they joined; Cart keeps 1150 and 1300 after it leaves.',
      'A record table at the bottom adds a row per publish with three columns, "Published", "Sender knows" and "Reached": 1200 · 1 · 0, 1150 · 1 · 1, 1300 · 1 · 3, 1250 · 1 · 2. The middle column is 1 every time.',
      'The broker keeps no history and has no acknowledgement or retry; time is not counted, and a publish step both sends and delivers. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one event per step — publish, join or leave — and stops after the fourth publish.',
        'A Replay button and a playback strip sit below. Scrubbing across the three joins shows the subscriber area filling while the sender side stays identical.',
        'The events and their order are fixed, so the Reached column 0, 1, 3, 2 and the Sender knows column of 1s can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article argues that a new consumer can be added without touching the producer and wants the number the producer depends on shown staying at 1 while receivers come and go.',
      'The reader asks what happens to an event published before a service subscribed, or when nobody is subscribed at all; 1150 missing from late joiners and 1200 dropped answer both.',
    ],

    avoidWhen: [
      'The article is about how many copies one message becomes. The fan-out happens here but is not counted against messages sent.',
      'The subject is a durable log where late consumers can read earlier messages. Nothing published here can be fetched afterwards.',
      'The point is coupling in code structure, such as interfaces or dependency injection within one program. The decoupling here is between separate senders and receivers over a broker.',
    ],

    contrastWith: [
      {
        concept: 'messagingPubsub',
        note: 'Pub/sub names the arrangement; decoupling is the property it buys — the sender\'s knowledge stays fixed at one topic name however the set of receivers changes.',
      },
      {
        concept: 'publishToMany',
        note: 'Decoupling is about who receives as membership changes. Fan-out is about how many copies one message becomes when membership is fixed.',
      },
      {
        concept: 'appendOnlyLog',
        note: 'Without a log a message exists only at the moment of publishing, so a late subscriber can never get it. An appended record stays at its offset, and a reader arriving later can still read it.',
      },
    ],
  },
};

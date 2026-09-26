/**
 * publishToMany 개념 선언.
 *
 * canonical facet 은 `facet:publishToMany` — 토픽 `order.placed` 에 구독자 셋(메일 · 재고 · 통계)이 처음부터 가입해 있고,
 * 보내는 쪽이 주문 번호 101 · 102 · 103 을 보낸다. 메시지 하나에 걸음 둘 — 보내기(보낸 것 +1) · 갈라지기(사본 +3).
 * 끝에 보낸 것 3 · 받은 사본 9. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (있는 `messagingPubsub` 아래 조각 둘 중 하나)
 *
 * 움직이는 것은 **갈라지는 사본**이고 화면 수는 보낸 것과 사본의 벌어짐이다. 구독자는 고정이다. 주장은
 * "한 번 보내면 구독자 수만큼 사본이 된다" 하나다. 그래서 definition 은 once · one copy per subscriber · multiplied ·
 * sent vs received 를 쥐고, 형제 `decoupleSenderReceiver` 의 join · leave · knows only the topic · dropped 를 쓰지 않는다.
 * 완제품 `messagingPubsub` 의 "보내는 쪽이 받는 쪽 대신 토픽을 부른다" 도 되풀이하지 않는다. 이 개념 파일은 고치지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `publishToMany.md` 가 밝힌 것):
 *  - 브로커는 지금 구독자 목록만 든다 — 보존 · 되읽기 · 확인 응답 · 재전송 없음.
 *  - 구독자는 받은 사본을 쌓기만 한다(처리 · 소비 없음). 시각을 셈하지 않는다.
 *  - 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const publishToManyConcept: FacetConceptSource = {
  id: 'publishToMany',
  label: 'Fan-Out: One Publish, One Copy per Subscriber',
  canonicalFacet: 'facet:publishToMany',

  surface: {
    definition:
      "Fan-out turns a single publish into one copy per subscriber, so the copies received grow as the messages sent multiplied by the number of subscribers.",
    exemplarKeywords: [
      'fan-out',
      'one-to-many messaging',
      'broadcast to subscribers',
      'SNS fan-out',
      'RabbitMQ fanout exchange',
      'Redis PUBLISH',
      'order placed event notifies several services',
      'message copies per subscriber',
      'publish once, deliver many',
      'multicast',
    ],
  },

  briefing: {
    observable: [
      'The sender on the left holds three order numbers, 101, 102, 103. The topic `order.placed` sits in the middle; three subscribers, Email, Stock and Stats, sit on the right. The opening caption reads "Topic order.placed. Subscribers: 3."',
      'Each message takes two steps. First one message travels from the sender into the topic — "The sender publishes to the topic: 101." — and "Sent" rises by 1 while "Copies received" stays.',
      'Then the topic splits it: one copy goes into each subscriber in the same step — "The topic puts a copy in every subscriber: 101. New copies: 3." — and "Copies received" rises by 3 while "Sent" stays.',
      'Two bars at the bottom stack Sent and Copies received on the same scale, one colour per message, so each cell on the Sent bar is matched by three of the same colour on the other.',
      'After six steps Sent reads 3 and Copies received reads 9; every subscriber holds 101, 102, 103 in the same order.',
      'Subscribers are fixed for the whole run, and the broker keeps no history, acknowledgements or retries; subscribers only collect what arrives. Time is not counted. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, a send step then a split step for each message, and stops after the third split.',
        'A Replay button and a playback strip sit below. Scrubbing between step 1 and step 2 shows Sent holding at 1 while Copies received jumps from 0 to 3.',
        'Messages and subscribers are fixed, so the counts 3 and 9 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader expects one message to be delivered once. Watching Sent stay at 1 while three copies appear shows that delivery count scales with subscribers.',
      'The article sizes the load a broker or its consumers carry and needs the multiplication — messages times subscribers — to be visible as two diverging counts.',
    ],

    avoidWhen: [
      'The article is about subscribers joining or leaving and who receives which message. The subscriber list never changes here.',
      'The subject is a work queue where each message goes to exactly one worker. Every subscriber here gets its own copy.',
      'The point is durable storage or replay of past messages. The topic keeps nothing once the copies are handed out.',
    ],

    contrastWith: [
      {
        concept: 'messagingPubsub',
        note: 'Pub/sub as a whole is the arrangement of topic, broker and subscribers. Fan-out is the arithmetic inside it: one send becomes as many deliveries as there are subscribers.',
      },
      {
        concept: 'decoupleSenderReceiver',
        note: 'Fan-out asks how many copies one message becomes with the audience held still. Decoupling asks what the sender must change when that audience changes, and the answer is nothing.',
      },
      {
        concept: 'queueFifo',
        note: 'A queue gives each item to a single taker, so items out equal items in. A topic copies each message to every subscriber, so deliveries are a multiple of messages.',
      },
    ],
  },
};

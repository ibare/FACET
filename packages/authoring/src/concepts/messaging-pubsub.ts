/**
 * messagingPubsub 개념 선언.
 *
 * canonical facet 은 `facet:messagingPubsub` — 좌 발행자 영역 / 우 구독자 영역 +
 * 가운데 broker 라이프라인 + 호출 트레이스.
 *
 * reactive 다. 모든 화살표가 broker 라이프라인에서 한 번 끊기는 것이 이 시각화의 서명.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const messagingPubsubConcept: FacetConceptSource = {
  id: 'messagingPubsub',
  label: 'Publish/Subscribe Messaging',
  domain: 'system-design',
  canonicalFacet: 'facet:messagingPubsub',

  surface: {
    definition:
      'Asynchronous messaging where senders address a named topic instead of a recipient, and a broker delivers a copy to every party subscribed to that topic.',
    exemplarKeywords: [
      'pub/sub',
      'publish subscribe',
      'message broker',
      'topic',
      'fan-out',
      'event-driven architecture',
      'decoupling producers and consumers',
      'Kafka',
      'observer pattern',
      'asynchronous messaging',
    ],
  },

  briefing: {
    observable: [
      'Every arrow breaks once at the broker lifeline in the middle and starts again on the other side — publishers and subscribers never touch, and the break is what indirection looks like.',
      'One publish fans out into as many copies as there are subscribers, and the copies arrive at different moments rather than together. Asynchrony is shown as staggered arrival, not as a label.',
      'Publishing to a topic nobody listens to still succeeds — the message simply has nowhere to fan out to, and the screen says so instead of erroring.',
      'A subscriber that joins after a publish does not receive it, and one that leaves stops receiving later ones. Membership is a moment in time, visible on the timeline.',
      'The two sides are labelled as areas rather than as named pairs, which is what makes it clear that neither side knows who is on the other.',
      'A call trace accumulates below, so the ordering of publishes and subscriptions stays readable.',
      'Four counters run along: publishes, deliveries, subscribes, unsubscribes.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet. Publisher, topic and subscriber fields plus publish, subscribe and unsubscribe buttons.',
        'The sequence that makes the idea land: publish once with no subscribers, then subscribe two parties and publish again — nothing, then two copies.',
        'Subscribing after a publish and publishing again is how to show that a topic carries no history here.',
      ],
    },

    useWhen: [
      'The reader still pictures a sender choosing a receiver. Watching a message addressed to a topic and copied to every subscriber is what removes the receiver from the sender\'s view.',
      'The article is about adding a consumer without touching the producer, which only shows when a new subscriber starts receiving mid-flow.',
    ],


    avoidWhen: [
      'The article is about message durability, replay, or consumer offsets. This broker holds no log — a message that finds no subscriber is simply gone.',
      'The subject is point-to-point queuing where each message goes to exactly one consumer. The fan-out here is the opposite behaviour.',
      'The point is delivery guarantees (at-least-once, exactly-once). Nothing on this screen represents acknowledgement or retry.',
    ],

    contrastWith: [
      {
        concept: 'queueFifo',
        note: 'A queue hands each item to one taker; pub/sub hands a copy to every taker. The word "queue" appears in both worlds and means different things.',
      },
    ],
  },
};

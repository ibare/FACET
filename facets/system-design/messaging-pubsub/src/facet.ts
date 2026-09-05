/**
 * MessagingPubsub facet JSON 선언.
 *
 * 진행 모델 메시지 시퀀스형 + 입력 반응형 (ReactiveMechanism).
 * mount 즉시 자동 시연 (P1·P2 events / P1 alerts / S5 join+subscribe / P3 events /
 * S3 unsubscribe / P1 events) 후 학습자 입력 대기.
 *
 * 컨트롤바 어휘 (기획 §6 §8 컨트롤 영역):
 *   [ publisher ] [ topic ] [ subscriber ] [ publish ] [ subscribe ] [ unsubscribe ] [ reset ]
 *
 * 코드 패널은 1차 구현에서 생략 (시스템 행동 시각이라 IR/언어 매핑 불필요).
 *
 * 식별자 (C1): `pub:<id>` `sub:<id>` `topic:<name>` `msg:<traceIndex>` 명시 prefix.
 */

import type { FacetJson } from '@ffacet/core/runtime';

export const messagingPubsubFacet: FacetJson = {
  id: 'facet:messagingPubsub',
  title: { en: 'Pub/Sub Messaging', ko: 'Pub/Sub 메시징' },
  description: {
    en: 'Many-to-many asynchronous messaging where publishers and subscribers know only the broker topic — a single publish fans out to every subscriber as copies',
    ko: '발행자와 구독자가 서로의 신원 대신 broker 의 토픽 라벨만 매개로 — 한 발행이 모든 구독자에게 사본으로 펼쳐지는 다대다 비동기 메시징',
  },
  algorithm: 'module:messagingPubsub',
  projector: 'module:messagingPubsubProjector',
  initialData: {
    type: 'messaging-pubsub',
    publishers: ['P1', 'P2', 'P3'],
    subscribers: ['S1', 'S2', 'S3', 'S4'],
    topics: ['events', 'alerts'],
    initialSubscriptions: [
      { subscriberId: 'S1', topic: 'events' },
      { subscriberId: 'S2', topic: 'events' },
      { subscriberId: 'S2', topic: 'alerts' },
      { subscriberId: 'S3', topic: 'events' },
      { subscriberId: 'S4', topic: 'events' },
    ],
    autoDemoIntervalMs: 900,
    autoDemoSequence: [
      { op: 'publish', publisher: 'P1', topic: 'events' },
      { op: 'publish', publisher: 'P2', topic: 'events' },
      { op: 'publish', publisher: 'P1', topic: 'alerts' },
      { op: 'join', subscriber: 'S5' },
      { op: 'subscribe', subscriber: 'S5', topic: 'events' },
      { op: 'publish', publisher: 'P3', topic: 'events' },
      { op: 'unsubscribe', subscriber: 'S3', topic: 'events' },
      { op: 'publish', publisher: 'P1', topic: 'events' },
    ],
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  messages: {
    'caption.base': { en: 'Pub/Sub lets publishers and subscribers know only the broker\'s topic label instead of each other\'s identity — one publish fans out to every subscriber as copies, making many-to-many asynchronous messaging work.', ko: 'Pub/Sub 은 발행자와 구독자가 서로의 신원 대신 broker 의 토픽 라벨만 매개로 — 한 발행이 모든 구독자에게 사본으로 펼쳐지는 다대다 비동기 메시징을 성립시킨다.' },
    'caption.handover': { en: 'Your turn — type a publisher, topic and subscriber, then press publish, subscribe or unsubscribe.', ko: '이제 직접 — 발행자·토픽·구독자를 입력하고 publish / subscribe / unsubscribe 를 눌러 보세요.' },
    'caption.invalidInput': { en: '{op}: that input is not valid — "{raw}"', ko: '{op}: 입력이 올바르지 않다 — "{raw}"' },
    'caption.publishFanout': { en: 'One publish → {count} copies → each arriving at its own moment ({topic}).', ko: '한 발행 → {count} 사본 → 다른 도착 시각 ({topic}).' },
    'caption.publishNoSubscriber': { en: '{publisher} → {topic} published — nobody is listening on that topic.', ko: '{publisher} → {topic} 발행 — 그 토픽을 듣는 구독자가 없다.' },
    'caption.subscribe': { en: '{subscriber} joined {topic} — earlier publishes do not reach it.', ko: '{subscriber} 가 {topic} 에 합류 — 이전 발행은 받지 않는다.' },
    'caption.unsubscribe': { en: '{subscriber} left {topic} — later publishes will not reach it.', ko: '{subscriber} 가 {topic} 에서 빠짐 — 이후 발행은 받지 않는다.' },
    'label.noSubscriber': { en: 'no subscriber', ko: '구독자 없음' },
    'label.publisherArea': { en: 'publisher side', ko: '발행자 영역' },
    'label.references': { en: 'See also: Hohpe — Publish-Subscribe Channel · MS Azure Architecture Center · GoF Observer · Aiven Kafka Visualization', ko: '참고: Hohpe — Publish-Subscribe Channel · MS Azure Architecture Center · GoF Observer · Aiven Kafka Visualization' },
    'label.subscriberArea': { en: 'subscriber side', ko: '구독자 영역' },
    'label.time': { en: 'time', ko: '시간' },
    'label.traceTitle': { en: 'Call trace', ko: '호출 트레이스' },
    'legend.indirection': { en: 'Publishers throw only at a topic and subscribers ask only for a topic — the broker in between hands out the copies, and every arrow breaks once at the broker lifeline and starts again.', ko: '발행자는 토픽에만 던지고 구독자는 토픽만 신청한다 — broker 가 사이에서 사본을 뿌리며 모든 화살표는 broker 라이프라인에서 한 번 끊어지고 다시 시작한다.' },
    'trace.join': { en: 't{row}  + {subscriber} joined the right-hand side', ko: 't{row}  + {subscriber} 우측 영역 합류' },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: {
      type: 'pubsub-stage',
    },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'publisher',
          action: 'input',
          label: { en: 'pub', ko: '발행자' },
          placeholder: { en: 'e.g. P1', ko: '예: P1' },
          default: '',
        },
        {
          widget: 'value-input',
          name: 'topic',
          action: 'input',
          label: { en: 'topic', ko: '토픽' },
          placeholder: { en: 'e.g. events', ko: '예: events' },
          default: '',
        },
        {
          widget: 'value-input',
          name: 'subscriber',
          action: 'input',
          label: { en: 'sub', ko: '구독자' },
          placeholder: { en: 'e.g. S5', ko: '예: S5' },
          default: '',
        },
        { widget: 'button', action: 'publish', label: { en: 'Publish', ko: '발행' } },
        { widget: 'button', action: 'subscribe', label: { en: 'Subscribe', ko: '구독' } },
        {
          widget: 'button',
          action: 'unsubscribe',
          label: { en: 'Unsubscribe', ko: '구독해지' },
        },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
      metrics: [
        { name: 'publish-count', label: { en: 'Publish', ko: '발행' }, initial: 0 },
        { name: 'deliver-count', label: { en: 'Deliver', ko: '배달' }, initial: 0 },
        { name: 'subscribe-count', label: { en: 'Sub', ko: '구독' }, initial: 0 },
        { name: 'unsub-count', label: { en: 'Unsub', ko: '해지' }, initial: 0 },
      ],
    },
  },
};

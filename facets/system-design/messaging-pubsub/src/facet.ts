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

import type { FacetJson } from '@facet/core/runtime';

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
          placeholder: '예: P1',
          default: '',
        },
        {
          widget: 'value-input',
          name: 'topic',
          action: 'input',
          label: { en: 'topic', ko: '토픽' },
          placeholder: '예: events',
          default: '',
        },
        {
          widget: 'value-input',
          name: 'subscriber',
          action: 'input',
          label: { en: 'sub', ko: '구독자' },
          placeholder: '예: S5',
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

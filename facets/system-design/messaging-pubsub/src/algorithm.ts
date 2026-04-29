/**
 * Pub/Sub (publish/subscribe) 시스템 행동 시각화 알고리즘 — 입력 반응형.
 *
 * mount 직후 자동 시연 (publish events·alerts → subscribe S5 → unsubscribe S3 등) 후
 * 무한 waitForInput 루프로 사용자 입력 (publish/subscribe/unsubscribe/reset) 을
 * 1:1 시각 사건으로 매핑한다.
 *
 * 식별자 (C1):
 *   - `pub:<id>`     발행자 박스 (예: pub:P1)
 *   - `sub:<id>`     구독자 박스 (예: sub:S2)
 *   - `topic:<name>` broker 의 토픽 라벨 (예: topic:events)
 *   - `msg:<traceIndex>` 한 발행 사건의 메시지 식별자 (사본 N 개의 공유 식별자)
 *
 * 이벤트 (C2 — 모두 facet 로컬, StandardEventType 미포함):
 *   - init                  payload: { publishers: string[]; subscribers: string[];
 *                                      topics: string[]; subscriptions: Array<{ subscriberId: string; topic: string }> }
 *   - publish               target: msg:<traceIndex>
 *                           payload: { traceIndex; publisherId; topic; messageNumber;
 *                                      deliverTo: string[] }
 *                           — 한 사건이 발행→broker도착→사본팬아웃→도착 4 단계를 모두 운반.
 *                             projector 가 4 단계로 펼친다.
 *   - subscribe             target: sub:<id>
 *                           payload: { traceIndex; subscriberId; topic }
 *   - unsubscribe           target: sub:<id>
 *                           payload: { traceIndex; subscriberId; topic }
 *   - subscriber-join       target: sub:<id>
 *                           payload: { traceIndex; subscriberId } — 새 구독자 박스가 우측에 페이드인.
 *   - invalid-input         payload: { op: string; raw: string }
 *   - demo-end              payload: {}
 *
 *   메타 (silent):
 *   - phase                 payload: { phase: 'auto-demo' | 'idle' | 'publish' | 'subscribe' | 'unsubscribe' }
 *
 * 메트릭 (C5):
 *   - 'publish-count'   발행 호출 횟수
 *   - 'deliver-count'   사본이 구독자에게 도달한 누적 수
 *   - 'subscribe-count' subscribe 호출 횟수
 *   - 'unsub-count'     unsubscribe 호출 횟수
 *
 * 진행 동력은 ReactiveMechanism. registerAlgorithm 시 mechanismKind: 'reactive'.
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type PubSubInputEvent =
  | { type: 'input'; payload?: { name: string; value: string } }
  | { type: 'publish'; payload?: { publisher?: string; topic?: string } }
  | { type: 'subscribe'; payload?: { subscriber?: string; topic?: string } }
  | { type: 'unsubscribe'; payload?: { subscriber?: string; topic?: string } };

export type PubSubFacetData = {
  type: 'messaging-pubsub';
  /** 발행자 식별자 (좌측 영역, 자동 시연 + 수동 발행 가능). */
  publishers: string[];
  /** 시뮬레이션 시작 시점에 등장하는 구독자 식별자 (우측 영역). */
  subscribers: string[];
  /** 토픽 이름. 첫 번째가 본 시각, 두 번째가 보조 영역. */
  topics: string[];
  /** 시뮬레이션 시작 시점 구독 매듭. */
  initialSubscriptions: Array<{ subscriberId: string; topic: string }>;
  /** 자동 시연 한 사건 사이 머무는 간격 ms. */
  autoDemoIntervalMs: number;
  /** 자동 시연 시퀀스. */
  autoDemoSequence: Array<
    | { op: 'publish'; publisher: string; topic: string }
    | { op: 'subscribe'; subscriber: string; topic: string }
    | { op: 'unsubscribe'; subscriber: string; topic: string }
    | { op: 'join'; subscriber: string }
  >;
};

function parseId(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 4) return null;
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) return null;
  return trimmed;
}

function parseTopic(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 8) return null;
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) return null;
  return trimmed;
}

export async function messagingPubsub(
  ctxBase: FacetContext<PubSubFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<PubSubFacetData>;
  const {
    publishers,
    subscribers: initialSubscribers,
    topics,
    initialSubscriptions,
    autoDemoIntervalMs,
    autoDemoSequence,
  } = ctx.data;

  // 모델 상태.
  const knownSubscribers = new Set<string>(initialSubscribers);
  // 토픽별 현재 구독자 집합.
  const subsByTopic = new Map<string, Set<string>>();
  for (const t of topics) subsByTopic.set(t, new Set<string>());
  for (const s of initialSubscriptions) {
    subsByTopic.get(s.topic)?.add(s.subscriberId);
  }

  // 발행자별 메시지 번호 카운터.
  const msgCounter = new Map<string, number>();
  for (const p of publishers) msgCounter.set(p, 0);

  let traceIndex = 0;
  let lastPublisher = '';
  let lastTopic = '';
  let lastSubscriber = '';

  function nextMessageNumber(publisherId: string): number {
    const cur = msgCounter.get(publisherId) ?? 0;
    const nxt = cur + 1;
    msgCounter.set(publisherId, nxt);
    return nxt;
  }

  async function emitPublish(publisherId: string, topic: string): Promise<void> {
    if (!publishers.includes(publisherId)) {
      await ctx.emit({
        type: 'invalid-input',
        payload: { op: 'publish', raw: `unknown publisher ${publisherId}` },
      });
      return;
    }
    if (!topics.includes(topic)) {
      await ctx.emit({
        type: 'invalid-input',
        payload: { op: 'publish', raw: `unknown topic ${topic}` },
      });
      return;
    }
    traceIndex += 1;
    ctx.metric('publish-count', 'inc');
    const subs = subsByTopic.get(topic) ?? new Set<string>();
    const deliverTo = [...subs];
    ctx.metric('deliver-count', deliverTo.length);
    const messageNumber = nextMessageNumber(publisherId);
    await ctx.emit({
      type: 'publish',
      target: `msg:${traceIndex}`,
      payload: {
        traceIndex,
        publisherId,
        topic,
        messageNumber,
        deliverTo,
      },
    });
  }

  async function emitSubscribe(subscriberId: string, topic: string): Promise<void> {
    if (!topics.includes(topic)) {
      await ctx.emit({
        type: 'invalid-input',
        payload: { op: 'subscribe', raw: `unknown topic ${topic}` },
      });
      return;
    }
    if (!knownSubscribers.has(subscriberId)) {
      // 새 구독자 — 박스 페이드인을 먼저 알린다.
      knownSubscribers.add(subscriberId);
      traceIndex += 1;
      await ctx.emit({
        type: 'subscriber-join',
        target: `sub:${subscriberId}`,
        payload: { traceIndex, subscriberId },
      });
    }
    const set = subsByTopic.get(topic);
    if (!set) return;
    if (set.has(subscriberId)) {
      // 이미 구독 중 — 무해한 noop.
      return;
    }
    set.add(subscriberId);
    traceIndex += 1;
    ctx.metric('subscribe-count', 'inc');
    await ctx.emit({
      type: 'subscribe',
      target: `sub:${subscriberId}`,
      payload: { traceIndex, subscriberId, topic },
    });
  }

  async function emitUnsubscribe(subscriberId: string, topic: string): Promise<void> {
    const set = subsByTopic.get(topic);
    if (!set || !set.has(subscriberId)) {
      await ctx.emit({
        type: 'invalid-input',
        payload: { op: 'unsubscribe', raw: `${subscriberId}/${topic} not subscribed` },
      });
      return;
    }
    set.delete(subscriberId);
    traceIndex += 1;
    ctx.metric('unsub-count', 'inc');
    await ctx.emit({
      type: 'unsubscribe',
      target: `sub:${subscriberId}`,
      payload: { traceIndex, subscriberId, topic },
    });
  }

  // 0. 초기 통보.
  await ctx.emit({
    type: 'init',
    payload: {
      publishers: [...publishers],
      subscribers: [...initialSubscribers],
      topics: [...topics],
      subscriptions: initialSubscriptions.map((s) => ({ ...s })),
    },
  });

  // 1. 자동 시연.
  await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });
  for (const step of autoDemoSequence) {
    if (ctx.cancelled) return;
    const ok = await ctx.sleep(autoDemoIntervalMs);
    if (!ok || ctx.cancelled) return;
    if (step.op === 'publish') {
      await ctx.emit({ type: 'phase', payload: { phase: 'publish' }, silent: true });
      await emitPublish(step.publisher, step.topic);
    } else if (step.op === 'subscribe') {
      await ctx.emit({ type: 'phase', payload: { phase: 'subscribe' }, silent: true });
      await emitSubscribe(step.subscriber, step.topic);
    } else if (step.op === 'unsubscribe') {
      await ctx.emit({ type: 'phase', payload: { phase: 'unsubscribe' }, silent: true });
      await emitUnsubscribe(step.subscriber, step.topic);
    } else if (step.op === 'join') {
      // 명시적 박스 페이드인 (구독은 별도 step 로 분리 가능).
      if (!knownSubscribers.has(step.subscriber)) {
        knownSubscribers.add(step.subscriber);
        traceIndex += 1;
        await ctx.emit({
          type: 'subscriber-join',
          target: `sub:${step.subscriber}`,
          payload: { traceIndex, subscriberId: step.subscriber },
        });
      }
    }
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'demo-end' });
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

  // 2. 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;
    let ev: PubSubInputEvent;
    try {
      ev = await ctx.waitForInput<PubSubInputEvent>();
    } catch {
      return;
    }

    if (ev.type === 'input') {
      const name = ev.payload?.name;
      const v = ev.payload?.value;
      if (typeof v === 'string') {
        if (name === 'publisher') lastPublisher = v;
        else if (name === 'topic') lastTopic = v;
        else if (name === 'subscriber') lastSubscriber = v;
      }
      continue;
    }

    if (ev.type === 'publish') {
      const rawPub =
        lastPublisher.trim() !== ''
          ? lastPublisher
          : typeof ev.payload?.publisher === 'string'
            ? ev.payload.publisher
            : publishers[0] ?? '';
      const rawTopic =
        lastTopic.trim() !== ''
          ? lastTopic
          : typeof ev.payload?.topic === 'string'
            ? ev.payload.topic
            : topics[0] ?? '';
      const pub = parseId(rawPub);
      const tp = parseTopic(rawTopic);
      if (pub === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'publish', raw: rawPub } });
        continue;
      }
      if (tp === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'publish', raw: rawTopic } });
        continue;
      }
      await ctx.emit({ type: 'phase', payload: { phase: 'publish' }, silent: true });
      await emitPublish(pub, tp);
      continue;
    }

    if (ev.type === 'subscribe') {
      const rawSub =
        lastSubscriber.trim() !== ''
          ? lastSubscriber
          : typeof ev.payload?.subscriber === 'string'
            ? ev.payload.subscriber
            : '';
      const rawTopic =
        lastTopic.trim() !== ''
          ? lastTopic
          : typeof ev.payload?.topic === 'string'
            ? ev.payload.topic
            : topics[0] ?? '';
      const sub = parseId(rawSub);
      const tp = parseTopic(rawTopic);
      if (sub === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'subscribe', raw: rawSub } });
        continue;
      }
      if (tp === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'subscribe', raw: rawTopic } });
        continue;
      }
      await ctx.emit({ type: 'phase', payload: { phase: 'subscribe' }, silent: true });
      await emitSubscribe(sub, tp);
      continue;
    }

    if (ev.type === 'unsubscribe') {
      const rawSub =
        lastSubscriber.trim() !== ''
          ? lastSubscriber
          : typeof ev.payload?.subscriber === 'string'
            ? ev.payload.subscriber
            : '';
      const rawTopic =
        lastTopic.trim() !== ''
          ? lastTopic
          : typeof ev.payload?.topic === 'string'
            ? ev.payload.topic
            : topics[0] ?? '';
      const sub = parseId(rawSub);
      const tp = parseTopic(rawTopic);
      if (sub === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'unsubscribe', raw: rawSub } });
        continue;
      }
      if (tp === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'unsubscribe', raw: rawTopic } });
        continue;
      }
      await ctx.emit({ type: 'phase', payload: { phase: 'unsubscribe' }, silent: true });
      await emitUnsubscribe(sub, tp);
      continue;
    }
  }
}

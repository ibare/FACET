/**
 * publish-to-many 의 장면.
 *
 * 바탕 — 토픽 이름 · 구독자(가입 차례) · 보낼 메시지(차례). `initial()` 이 자료에서 베낀다.
 * 셈  — 보낸 수 · 받은 사본 수. 알고리즘의 silent `init` 이 처음 값을 싣고, 걸음마다 이벤트가 싣는다.
 * 자취 — 보낸 메시지 · 토픽에 와 있는 메시지 · 구독자마다 받은 사본.
 * 이번 걸음 — `step`.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowPublishToManyData } from './algorithm.js';

export type PublishToManyStep =
  | { kind: 'send'; message: number }
  | { kind: 'fanOut'; message: number; to: string[] };

export type PublishToManyScene = {
  topic: string;
  subscribers: string[];
  messages: number[];
  /** 셈이 오기 전(silent init 앞)은 null */
  counts: { sent: number; copies: number } | null;
  /** 보낸 메시지, 보낸 차례 */
  sentMessages: number[];
  /** 토픽에 와서 아직 갈라지지 않은 메시지 */
  atTopic: number | null;
  /** 구독자마다 받은 사본 — `subscribers` 와 같은 차례 */
  inbox: { id: string; got: number[] }[];
  step: PublishToManyStep | null;
};

function field(payload: unknown, key: string, type: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`publish-to-many 장면: payload 가 객체가 아니다 (${type})`);
  }
  if (!(key in payload)) {
    throw new Error(`publish-to-many 장면: payload.${key} 가 없다 (${type})`);
  }
  return (payload as Record<string, unknown>)[key];
}

function intField(payload: unknown, key: string, type: string): number {
  const v = field(payload, key, type);
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`publish-to-many 장면: payload.${key} 가 정수가 아니다 (${type})`);
  }
  return v;
}

function needCounts(scene: PublishToManyScene, type: string): { sent: number; copies: number } {
  if (scene.counts === null) {
    throw new Error(`publish-to-many 장면: init 앞에 ${type} 이벤트가 왔다`);
  }
  return scene.counts;
}

export const publishToManyScene: ScenePlan<PublishToManyScene> = {
  initial(initialData: unknown): PublishToManyScene {
    const data = narrowPublishToManyData(initialData);
    return {
      topic: data.topic,
      subscribers: [...data.subscribers],
      messages: [...data.messages],
      counts: null,
      sentMessages: [],
      atTopic: null,
      inbox: data.subscribers.map((id) => ({ id, got: [] })),
      step: null,
    };
  },

  reduce(scene: PublishToManyScene, event: FacetRuntimeEvent): PublishToManyScene {
    switch (event.type) {
      case 'init': {
        const sent = intField(event.payload, 'sent', 'init');
        const copies = intField(event.payload, 'copies', 'init');
        if (scene.counts !== null) {
          throw new Error('publish-to-many 장면: init 이 두 번 왔다');
        }
        return { ...scene, counts: { sent, copies }, step: null };
      }
      case 'send': {
        const counts = needCounts(scene, 'send');
        const message = intField(event.payload, 'message', 'send');
        const sent = intField(event.payload, 'sent', 'send');
        if (!scene.messages.includes(message)) {
          throw new Error(`publish-to-many 장면: send.message ${message} 가 보낼 메시지에 없다`);
        }
        if (scene.sentMessages.includes(message)) {
          throw new Error(`publish-to-many 장면: send.message ${message} 는 이미 보냈다`);
        }
        if (scene.atTopic !== null) {
          throw new Error(
            `publish-to-many 장면: 토픽에 ${scene.atTopic} 가 남은 채 send.message ${message} 가 왔다`,
          );
        }
        if (sent !== counts.sent + 1) {
          throw new Error(
            `publish-to-many 장면: send.sent ${sent} 가 앞의 보낸 수 ${counts.sent} 에서 하나 는 값이 아니다`,
          );
        }
        return {
          ...scene,
          counts: { sent, copies: counts.copies },
          sentMessages: [...scene.sentMessages, message],
          atTopic: message,
          inbox: scene.inbox.map((b) => ({ id: b.id, got: [...b.got] })),
          step: { kind: 'send', message },
        };
      }
      case 'fanOut': {
        const counts = needCounts(scene, 'fanOut');
        const message = intField(event.payload, 'message', 'fanOut');
        const copies = intField(event.payload, 'copies', 'fanOut');
        const rawTo = field(event.payload, 'to', 'fanOut');
        if (!Array.isArray(rawTo)) {
          throw new Error('publish-to-many 장면: fanOut.to 가 배열이 아니다');
        }
        const to: string[] = rawTo.map((s: unknown, i: number) => {
          if (typeof s !== 'string' || !scene.subscribers.includes(s)) {
            throw new Error(`publish-to-many 장면: fanOut.to[${i}] 가 구독자가 아니다 (${String(s)})`);
          }
          return s;
        });
        if (scene.atTopic !== message) {
          throw new Error(
            `publish-to-many 장면: fanOut.message ${message} 가 토픽에 와 있는 메시지(${String(scene.atTopic)})가 아니다`,
          );
        }
        if (copies !== counts.copies + to.length) {
          throw new Error(
            `publish-to-many 장면: fanOut.copies ${copies} 가 앞의 사본 ${counts.copies} + 받은 곳 ${to.length} 와 맞지 않는다`,
          );
        }
        return {
          ...scene,
          counts: { sent: counts.sent, copies },
          sentMessages: [...scene.sentMessages],
          atTopic: null,
          inbox: scene.inbox.map((b) => ({
            id: b.id,
            got: to.includes(b.id) ? [...b.got, message] : [...b.got],
          })),
          step: { kind: 'fanOut', message, to },
        };
      }
      default:
        throw new Error(`publish-to-many 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};

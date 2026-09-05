/**
 * MessagingPubsub Projector — algorithm 이벤트를 pubsub-stage view 메서드로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. broker 분리 띠 — 어떤 화살표도 분리 띠를 직접 가로지르지 못한다 (위치만으로 강제).
 *   2. 부채꼴 N 사본 — 한 발행이 broker 분기점에서 사본 N 개로 갈라져 사선 배열로 도달.
 *   3. 토픽 라벨이 매개 — 박스/매듭/도착·출발 라벨에 토픽 이름만 등장한다.
 *   4. 동적 합류·이탈 — subscribe / unsubscribe 가 라이프라인 활성 구간을 갱신.
 *   5. 토픽 격리 보조 — events/alerts 두 토픽이 같은 broker 박스 안 두 라이프라인으로 분리.
 *
 * 운동 시간 (ms) 은 기획 §8 / §9 기준 + runtime.getSpeed() 보정 (현재 stage 가
 * 자체 ms 상수를 갖고 있어, opts.duration 은 보조적으로만 전달).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type PubsubStage = {
  reset(): void;
  init(payload: {
    publishers: string[];
    subscribers: string[];
    topics: string[];
    subscriptions: Array<{ subscriberId: string; topic: string }>;
  }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  emitPublish(
    payload: {
      traceIndex: number;
      publisherId: string;
      topic: string;
      messageNumber: number;
      deliverTo: string[];
    },
    opts?: { duration?: number },
  ): Promise<void>;
  emitSubscribe(
    payload: { traceIndex: number; subscriberId: string; topic: string },
    opts?: { duration?: number },
  ): Promise<void>;
  emitUnsubscribe(
    payload: { traceIndex: number; subscriberId: string; topic: string },
    opts?: { duration?: number },
  ): Promise<void>;
  emitSubscriberJoin(
    payload: { traceIndex: number; subscriberId: string },
    opts?: { duration?: number },
  ): Promise<void>;
  signalInvalid(op: string, raw: string): void;
  signalDemoEnd(): void;
};


export const messagingPubsubProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  /** 상시 캡션. 여러 곳에서 쓰이므로 en 원본 리터럴은 여기 한 번만 둔다. */
  const baseCaption = (): string =>
    tr(
      'caption.base',
      "Pub/Sub lets publishers and subscribers know only the broker's topic label instead of each other's identity — one publish fans out to every subscriber as copies, making many-to-many asynchronous messaging work.",
    );
  const stage = views.stage as unknown as PubsubStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(baseCaption());
    },

    async onEvent(event) {
      if (!stage) return;
      const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as {
            publishers?: string[];
            subscribers?: string[];
            topics?: string[];
            subscriptions?: Array<{ subscriberId: string; topic: string }>;
          };
          stage.init({
            publishers: Array.isArray(p.publishers) ? p.publishers.map(String) : [],
            subscribers: Array.isArray(p.subscribers) ? p.subscribers.map(String) : [],
            topics: Array.isArray(p.topics) ? p.topics.map(String) : [],
            subscriptions: Array.isArray(p.subscriptions)
              ? p.subscriptions.map((s) => ({
                  subscriberId: String(s.subscriberId ?? ''),
                  topic: String(s.topic ?? ''),
                }))
              : [],
          });
          break;
        }

        case 'publish': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            publisherId?: string;
            topic?: string;
            messageNumber?: number;
            deliverTo?: string[];
          };
          const dur = 1100 / speed;
          await stage.emitPublish(
            {
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
              publisherId: String(p.publisherId ?? ''),
              topic: String(p.topic ?? ''),
              messageNumber: typeof p.messageNumber === 'number' ? p.messageNumber : 0,
              deliverTo: Array.isArray(p.deliverTo) ? p.deliverTo.map(String) : [],
            },
            { duration: dur },
          );
          break;
        }

        case 'subscribe': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            subscriberId?: string;
            topic?: string;
          };
          const dur = 420 / speed;
          await stage.emitSubscribe(
            {
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
              subscriberId: String(p.subscriberId ?? ''),
              topic: String(p.topic ?? ''),
            },
            { duration: dur },
          );
          break;
        }

        case 'unsubscribe': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            subscriberId?: string;
            topic?: string;
          };
          const dur = 420 / speed;
          await stage.emitUnsubscribe(
            {
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
              subscriberId: String(p.subscriberId ?? ''),
              topic: String(p.topic ?? ''),
            },
            { duration: dur },
          );
          break;
        }

        case 'subscriber-join': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            subscriberId?: string;
          };
          const dur = 360 / speed;
          await stage.emitSubscriberJoin(
            {
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
              subscriberId: String(p.subscriberId ?? ''),
            },
            { duration: dur },
          );
          break;
        }

        case 'invalid-input': {
          const p = (event.payload ?? {}) as { op?: string; raw?: string };
          stage.signalInvalid(String(p.op ?? ''), String(p.raw ?? ''));
          break;
        }

        case 'demo-end': {
          stage.signalDemoEnd();
          break;
        }

        default:
          // phase 등 silent 메타 이벤트는 시각 변화 없음 — 의도적 drop.
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(baseCaption());
    },
  };
};

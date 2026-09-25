/**
 * send-and-forget 장면 — 이벤트를 잇기만 한다. 셈(도착 틱 · 뒤바뀐 자리)은 알고리즘이 한다.
 *
 * - 바탕: 두 끝의 주소 · 데이터그램 이름 · (init 뒤) 보낸 틱과 도착 틱
 * - 자취: 지금 틱 · 앱이 받은 차례 · 보낸 번호
 * - 이번 걸음: `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneDatagram = {
  name: string;
  /** init 전에는 null */
  sendTick: number | null;
  arriveTick: number | null;
};

export type SceneArrival = { index: number; after: number[] };

export type SendAndForgetStep =
  | { kind: 'start' }
  | {
      kind: 'tick';
      tick: number;
      arrived: SceneArrival[];
      sent: number | null;
      lost: boolean;
      last: boolean;
    };

export type SendAndForgetScene = {
  sender: string;
  receiver: string;
  datagrams: SceneDatagram[];
  /** 지금 틱 — 걸음 0 은 0 */
  tick: number;
  /** 앱이 받은 차례 (데이터그램 번호) */
  received: number[];
  /** 보낸 차례 (데이터그램 번호). 같은 번호가 두 번 오면 다시 보낸 것이다 */
  sent: number[];
  step: SendAndForgetStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readInt(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`send-and-forget 장면: ${what} 이 정수가 아니다`);
  return v;
}

function readIntOrNull(v: unknown, what: string): number | null {
  return v === null ? null : readInt(v, what);
}

export const sendAndForgetScene: ScenePlan<SendAndForgetScene> = {
  initial(initialData: unknown): SendAndForgetScene {
    const d = isRecord(initialData) ? initialData : {};
    const list = Array.isArray(d['datagrams']) ? d['datagrams'] : [];
    const datagrams: SceneDatagram[] = list.map((g, i) => {
      if (!isRecord(g) || typeof g['name'] !== 'string') {
        throw new Error(`send-and-forget 장면: ${i} 번째 데이터그램에 이름이 없다`);
      }
      return { name: g['name'], sendTick: null, arriveTick: null };
    });
    const sender = d['sender'];
    const receiver = d['receiver'];
    if (typeof sender !== 'string' || sender === '') throw new Error('send-and-forget 장면: 보내는 쪽 주소(sender)가 없다');
    if (typeof receiver !== 'string' || receiver === '') throw new Error('send-and-forget 장면: 받는 쪽 주소(receiver)가 없다');
    return {
      sender,
      receiver,
      datagrams,
      tick: 0,
      received: [],
      sent: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: SendAndForgetScene, event: FacetRuntimeEvent): SendAndForgetScene {
    const p = event.payload;
    if (event.type === 'init') {
      if (!isRecord(p) || !Array.isArray(p['datagrams'])) throw new Error('send-and-forget 장면: init 에 datagrams 가 없다');
      const datagrams: SceneDatagram[] = p['datagrams'].map((g, i) => {
        if (!isRecord(g) || typeof g['name'] !== 'string') {
          throw new Error(`send-and-forget 장면: init 의 ${i} 번째 데이터그램이 틀렸다`);
        }
        return {
          name: g['name'],
          sendTick: readInt(g['sendTick'], 'sendTick'),
          arriveTick: readIntOrNull(g['arriveTick'], 'arriveTick'),
        };
      });
      return { ...scene, datagrams, received: [], sent: [], tick: 0, step: { kind: 'start' } };
    }
    if (event.type === 'tick') {
      if (!isRecord(p)) throw new Error('send-and-forget 장면: tick 에 payload 가 없다');
      const tick = readInt(p['tick'], 'tick');
      const rawArrived = p['arrived'];
      if (!Array.isArray(rawArrived)) throw new Error('send-and-forget 장면: tick 에 arrived 가 없다');
      const count = scene.datagrams.length;
      const arrived: SceneArrival[] = rawArrived.map((a) => {
        if (!isRecord(a) || !Array.isArray(a['after'])) throw new Error('send-and-forget 장면: arrived 항목이 틀렸다');
        const index = readInt(a['index'], 'arrived.index');
        if (index < 0 || index >= count) throw new Error(`send-and-forget 장면: 모르는 데이터그램 번호 ${index}`);
        return { index, after: a['after'].map((j) => readInt(j, 'arrived.after')) };
      });
      const sent = readIntOrNull(p['sent'], 'sent');
      if (sent !== null && (sent < 0 || sent >= count)) throw new Error(`send-and-forget 장면: 모르는 데이터그램 번호 ${sent}`);
      if (typeof p['lost'] !== 'boolean' || typeof p['last'] !== 'boolean') {
        throw new Error('send-and-forget 장면: tick 의 lost · last 가 참거짓이 아니다');
      }
      return {
        ...scene,
        tick,
        received: [...scene.received, ...arrived.map((a) => a.index)],
        sent: sent === null ? [...scene.sent] : [...scene.sent, sent],
        step: { kind: 'tick', tick, arrived, sent, lost: p['lost'], last: p['last'] },
      };
    }
    return scene;
  },
};

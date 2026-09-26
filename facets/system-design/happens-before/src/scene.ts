/**
 * happens-before 장면 — 이벤트를 잇기만 한다. 셈(수 · 잇는 길)은 알고리즘이 싣는다.
 *
 * 바탕: 프로세스 · 사건 정의 · 사다리 꼭대기(top)
 * 자취: 프로세스마다 지금 수 · 일어난 사건과 그 수 · 보낸 메시지(받혔는지) · 물은 짝
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowHappensBeforeData, type HbEventDef } from './algorithm.js';

export type HbPlaced = { id: string; process: string; n: number };

export type HbMessage = {
  id: string;
  /** 보낸 사건 */
  sender: string;
  /** 실려 온 수 */
  carried: number;
  receiver: string;
  /** 받은 사건 — 아직 가는 중이면 null */
  received: string | null;
};

export type HbAsk = {
  a: string;
  b: string;
  na: number;
  nb: number;
  forward: string[] | null;
  backward: string[] | null;
};

export type HbStep =
  | { kind: 'start' }
  | { kind: 'local'; event: string; process: string; from: number; to: number }
  | { kind: 'send'; event: string; process: string; from: number; to: number; message: string }
  | { kind: 'receive'; event: string; process: string; from: number; to: number; message: string; carried: number }
  | { kind: 'ask'; index: number };

export type HappensBeforeScene = {
  processes: string[];
  events: HbEventDef[];
  top: number | null;
  clocks: { process: string; n: number }[] | null;
  placed: HbPlaced[];
  messages: HbMessage[];
  asks: HbAsk[];
  step: HbStep;
};

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`happens-before 장면: ${path} 모양이 틀렸다`);
  return v as Record<string, unknown>;
}
function str(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`happens-before 장면: ${path}.${key} 는 문자열이어야 한다`);
  return v;
}
function num(o: Record<string, unknown>, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`happens-before 장면: ${path}.${key} 는 수여야 한다`);
  return v;
}
function route(o: Record<string, unknown>, key: string, path: string): string[] | null {
  const v = o[key];
  if (v === null) return null;
  if (!Array.isArray(v) || v.length < 2 || !v.every((x) => typeof x === 'string')) {
    throw new Error(`happens-before 장면: ${path}.${key} 는 길(사건 둘 이상) 또는 null 이어야 한다`);
  }
  return [...(v as string[])];
}

/** 사건이 바탕에 있고, 가리킨 프로세스 · 종류가 맞고, 아직 일어나지 않았는지 본다. 지금 수와 from 도 맞춘다. */
function checkEvent(
  scene: HappensBeforeScene,
  p: Record<string, unknown>,
  kind: HbEventDef['kind'],
): { def: HbEventDef; process: string; from: number; to: number; clocks: { process: string; n: number }[] } {
  const clocks = scene.clocks;
  if (clocks === null) throw new Error('happens-before 장면: init 전에 사건이 왔다');
  const event = str(p, 'event', 'payload');
  const process = str(p, 'process', 'payload');
  const def = scene.events.find((e) => e.id === event);
  if (!def) throw new Error(`happens-before 장면: payload.event ${event} 가 바탕에 없다`);
  if (def.process !== process) throw new Error(`happens-before 장면: payload.process ${process} 가 ${event} 의 프로세스와 다르다`);
  if (def.kind !== kind) throw new Error(`happens-before 장면: ${event} 의 종류가 ${kind} 가 아니다`);
  if (scene.placed.some((x) => x.id === event)) throw new Error(`happens-before 장면: ${event} 가 두 번 일어났다`);
  const from = num(p, 'from', 'payload');
  const to = num(p, 'to', 'payload');
  const now = clocks.find((c) => c.process === process);
  if (!now) throw new Error(`happens-before 장면: 프로세스 ${process} 의 수가 없다`);
  if (now.n !== from) throw new Error(`happens-before 장면: payload.from ${from} 가 ${process} 의 지금 수 ${now.n} 와 다르다`);
  if (!(to > from)) throw new Error(`happens-before 장면: payload.to 가 오르지 않았다`);
  return { def, process, from, to, clocks: clocks.map((c) => (c.process === process ? { process, n: to } : { ...c })) };
}

export const happensBeforeScene: ScenePlan<HappensBeforeScene> = {
  initial(initialData: unknown): HappensBeforeScene {
    const data = narrowHappensBeforeData(initialData);
    return {
      processes: [...data.processes],
      events: data.events.map((e) => ({ ...e })),
      top: null,
      clocks: null,
      placed: [],
      messages: [],
      asks: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: HappensBeforeScene, event: FacetRuntimeEvent): HappensBeforeScene {
    const p = rec(event.payload, 'payload');
    switch (event.type) {
      case 'init': {
        const top = num(p, 'top', 'payload');
        if (!Array.isArray(p.clocks)) throw new Error('happens-before 장면: payload.clocks 는 배열이어야 한다');
        const clocks = p.clocks.map((c, i) => {
          const o = rec(c, `payload.clocks[${i}]`);
          return { process: str(o, 'process', `payload.clocks[${i}]`), n: num(o, 'n', `payload.clocks[${i}]`) };
        });
        if (clocks.length !== scene.processes.length || !scene.processes.every((q, i) => clocks[i]!.process === q)) {
          throw new Error('happens-before 장면: payload.clocks 가 바탕의 프로세스와 맞지 않다');
        }
        return { ...scene, top, clocks, placed: [], messages: [], asks: [], step: { kind: 'start' } };
      }
      case 'local': {
        const c = checkEvent(scene, p, 'local');
        return {
          ...scene,
          clocks: c.clocks,
          placed: [...scene.placed, { id: c.def.id, process: c.process, n: c.to }],
          step: { kind: 'local', event: c.def.id, process: c.process, from: c.from, to: c.to },
        };
      }
      case 'send': {
        const c = checkEvent(scene, p, 'send');
        const message = str(p, 'message', 'payload');
        const receiver = str(p, 'receiver', 'payload');
        if (c.def.message !== message || c.def.to !== receiver) {
          throw new Error(`happens-before 장면: payload.message · receiver 가 ${c.def.id} 의 바탕과 다르다`);
        }
        return {
          ...scene,
          clocks: c.clocks,
          placed: [...scene.placed, { id: c.def.id, process: c.process, n: c.to }],
          messages: [
            ...scene.messages.map((m) => ({ ...m })),
            { id: message, sender: c.def.id, carried: c.to, receiver, received: null },
          ],
          step: { kind: 'send', event: c.def.id, process: c.process, from: c.from, to: c.to, message },
        };
      }
      case 'receive': {
        const c = checkEvent(scene, p, 'receive');
        const message = str(p, 'message', 'payload');
        const sender = str(p, 'sender', 'payload');
        const carried = num(p, 'carried', 'payload');
        if (c.def.message !== message) throw new Error(`happens-before 장면: payload.message 가 ${c.def.id} 의 바탕과 다르다`);
        const m = scene.messages.find((x) => x.id === message);
        if (!m) throw new Error(`happens-before 장면: 메시지 ${message} 가 아직 보내지지 않았다`);
        if (m.received !== null) throw new Error(`happens-before 장면: 메시지 ${message} 가 이미 받혔다`);
        if (m.sender !== sender || m.carried !== carried || m.receiver !== c.process) {
          throw new Error(`happens-before 장면: payload.sender · carried 가 보낸 메시지와 다르다`);
        }
        if (!(c.to > carried)) throw new Error('happens-before 장면: 받은 수가 실려 온 수보다 크지 않다');
        return {
          ...scene,
          clocks: c.clocks,
          placed: [...scene.placed, { id: c.def.id, process: c.process, n: c.to }],
          messages: scene.messages.map((x) => (x.id === message ? { ...x, received: c.def.id } : { ...x })),
          step: { kind: 'receive', event: c.def.id, process: c.process, from: c.from, to: c.to, message, carried },
        };
      }
      case 'ask': {
        const a = str(p, 'a', 'payload');
        const b = str(p, 'b', 'payload');
        const na = num(p, 'na', 'payload');
        const nb = num(p, 'nb', 'payload');
        const pa = scene.placed.find((x) => x.id === a);
        const pb = scene.placed.find((x) => x.id === b);
        if (!pa || !pb) throw new Error(`happens-before 장면: 묻는 짝 ${a} · ${b} 가 아직 일어나지 않았다`);
        if (pa.n !== na || pb.n !== nb) throw new Error(`happens-before 장면: payload.na · nb 가 일어난 수와 다르다`);
        const forward = route(p, 'forward', 'payload');
        const backward = route(p, 'backward', 'payload');
        for (const r of [forward, backward]) {
          if (r !== null && !r.every((id) => scene.placed.some((x) => x.id === id))) {
            throw new Error('happens-before 장면: 잇는 길이 일어나지 않은 사건을 지난다');
          }
        }
        const asks = [...scene.asks.map((x) => ({ ...x })), { a, b, na, nb, forward, backward }];
        return { ...scene, asks, step: { kind: 'ask', index: asks.length - 1 } };
      }
      default:
        throw new Error(`happens-before 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};

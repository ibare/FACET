/**
 * spread-in-turn 장면 — 이벤트를 잇기만 한다. 고름 · 받은 수 · 쌓인 무게는 알고리즘이 셈해 싣는다.
 *
 * 바탕: 서버 · 요청 (자료에서 베낀다)
 * 자취: 차례 표 · 서버마다 받은 요청 차례 · 받은 수 · 쌓인 무게
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readSpreadData, type SpreadRequest } from './algorithm.js';

export type SpreadStep =
  | { kind: 'start' }
  | {
      kind: 'pick';
      /** 요청 자리 (requests 안) */
      request: number;
      /** 받은 서버 자리 = 이 걸음 앞 차례 표 */
      server: number;
      /** 한 칸 돈 뒤 차례 표 자리 */
      next: number;
    };

export type SpreadScene = {
  servers: string[];
  requests: SpreadRequest[];
  /** 차례 표가 가리키는 서버 자리 */
  pointer: number;
  /** 서버 자리마다 받은 요청 자리, 받은 차례대로 */
  stacks: number[][];
  /** 알고리즘이 셈한 받은 수 · 쌓인 무게. init 전에는 null */
  received: number[] | null;
  load: number[] | null;
  /** 도착한 요청 수 — 줄의 머리 자리 */
  arrived: number;
  step: SpreadStep;
};

function fail(path: string, why: string): never {
  throw new Error(`spread-in-turn 장면: ${path} — ${why}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function serverAt(scene: SpreadScene, v: unknown, path: string): number {
  if (typeof v !== 'string') fail(path, '서버 식별자 문자열이 아니다');
  const i = scene.servers.indexOf(v);
  if (i < 0) fail(path, `바탕에 없는 서버 ${v}`);
  return i;
}

function count(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(path, '0 이상의 정수가 아니다');
  return v;
}

function counts(v: unknown, n: number, path: string): number[] {
  if (!Array.isArray(v) || v.length !== n) fail(path, `길이 ${n} 인 배열이 아니다`);
  return v.map((x, i) => count(x, `${path}[${i}]`));
}

export const spreadInTurnScene: ScenePlan<SpreadScene> = {
  initial(initialData: unknown): SpreadScene {
    const data = readSpreadData(initialData);
    return {
      servers: [...data.servers],
      requests: data.requests.map((r) => ({ id: r.id, weight: r.weight })),
      pointer: data.servers.indexOf(data.start),
      stacks: data.servers.map(() => []),
      received: null,
      load: null,
      arrived: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: SpreadScene, event: FacetRuntimeEvent): SpreadScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const n = scene.servers.length;
        return {
          ...scene,
          pointer: serverAt(scene, p.pointer, 'init.payload.pointer'),
          stacks: scene.servers.map(() => []),
          received: counts(p.received, n, 'init.payload.received'),
          load: counts(p.load, n, 'init.payload.load'),
          arrived: 0,
          step: { kind: 'start' },
        };
      }
      case 'pick': {
        const p = payloadOf(event);
        if (scene.received === null || scene.load === null) fail('pick', 'init 앞에 왔다');
        if (scene.arrived >= scene.requests.length) fail('pick', '줄에 남은 요청이 없다');
        const head = scene.requests[scene.arrived];
        if (p.request !== head.id) fail('pick.payload.request', `줄의 머리는 ${head.id} 이다`);
        const server = serverAt(scene, p.server, 'pick.payload.server');
        if (server !== scene.pointer) fail('pick.payload.server', `차례 표는 ${scene.servers[scene.pointer]} 를 가리킨다`);
        const next = serverAt(scene, p.next, 'pick.payload.next');
        const received = [...scene.received];
        const load = [...scene.load];
        received[server] = count(p.received, 'pick.payload.received');
        load[server] = count(p.load, 'pick.payload.load');
        const stacks = scene.stacks.map((s, i) => (i === server ? [...s, scene.arrived] : [...s]));
        return {
          ...scene,
          pointer: next,
          stacks,
          received,
          load,
          arrived: scene.arrived + 1,
          step: { kind: 'pick', request: scene.arrived, server, next },
        };
      }
      default:
        fail('event.type', `모르는 이벤트 ${event.type}`);
    }
  },
};

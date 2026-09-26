/**
 * origin-pull 장면 — 이벤트를 잇기만 한다. 적중 · 합류 판정과 기다림 셈은 알고리즘이 싣는다.
 *
 * 바탕: path · fetchMs · 요청 목록(식별자 · 도착 ms)
 * 자취: 요청마다의 자리(아직 · 기다림 · 받음)와 기다림 ms, 줄, 가는 중인 가져오기, 엣지에 든 것, 오리진 요청 수, 지금 시각
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowOriginPullData } from './algorithm.js';

export type OriginPullReqState = 'ahead' | 'waiting' | 'served';

export type OriginPullReq = {
  id: string;
  at: number;
  state: OriginPullReqState;
  /** 받은 ms − 도착 ms. 받기 전에는 null */
  wait: number | null;
};

export type OriginPullStep =
  | { kind: 'init' }
  | { kind: 'miss'; id: string; was: number }
  | { kind: 'join'; id: string; was: number }
  | { kind: 'hit'; id: string; was: number }
  | { kind: 'response'; ids: string[]; was: number; fetchStart: number };

export type OriginPullScene = {
  path: string;
  fetchMs: number;
  requests: OriginPullReq[];
  /** 가는 중인 가져오기에 붙어 기다리는 요청 식별자 — 붙은 차례대로 */
  queue: string[];
  fetch: { start: number; end: number } | null;
  /** 엣지가 경로를 들고 있는가. init 전에는 null */
  cached: boolean | null;
  now: number | null;
  originCalls: number | null;
  step: OriginPullStep | null;
};

function bad(path: string, why: string): never {
  throw new Error(`originPullScene: ${path} — ${why}`);
}

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) bad(path, '객체가 아니다');
  return v as Record<string, unknown>;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(path, '수가 아니다');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') bad(path, '문자열이 아니다');
  return v;
}

function ready(scene: OriginPullScene, type: string): { now: number; originCalls: number; cached: boolean } {
  if (scene.now === null || scene.originCalls === null || scene.cached === null) {
    bad(type, 'init 전에 왔다');
  }
  return { now: scene.now, originCalls: scene.originCalls, cached: scene.cached };
}

function findReq(scene: OriginPullScene, id: string, path: string): OriginPullReq {
  const r = scene.requests.find((q) => q.id === id);
  if (r === undefined) bad(path, `바탕에 없는 요청: ${id}`);
  return r;
}

export const originPullScene: ScenePlan<OriginPullScene> = {
  initial(initialData: unknown): OriginPullScene {
    const data = narrowOriginPullData(initialData);
    return {
      path: data.path,
      fetchMs: data.fetchMs,
      requests: data.requests.map((r) => ({ id: r.id, at: r.at, state: 'ahead', wait: null })),
      queue: [],
      fetch: null,
      cached: null,
      now: null,
      originCalls: null,
      step: null,
    };
  },

  reduce(scene: OriginPullScene, event: FacetRuntimeEvent): OriginPullScene {
    switch (event.type) {
      case 'init': {
        const p = rec(event.payload, 'init.payload');
        const cached = p.cached;
        if (typeof cached !== 'boolean') bad('init.payload.cached', '참거짓이 아니다');
        return {
          ...scene,
          requests: scene.requests.map((r) => ({ ...r })),
          queue: [],
          fetch: null,
          cached,
          now: num(p.now, 'init.payload.now'),
          originCalls: num(p.originCalls, 'init.payload.originCalls'),
          step: { kind: 'init' },
        };
      }

      case 'arrive': {
        const base = ready(scene, 'arrive');
        const p = rec(event.payload, 'arrive.payload');
        const id = str(p.id, 'arrive.payload.id');
        const at = num(p.at, 'arrive.payload.at');
        const outcome = p.outcome;
        const originCalls = num(p.originCalls, 'arrive.payload.originCalls');
        const req = findReq(scene, id, 'arrive.payload.id');
        if (req.state !== 'ahead') bad('arrive.payload.id', `이미 도착한 요청: ${id}`);
        if (req.at !== at) bad('arrive.payload.at', `바탕의 도착 ms ${req.at} 과 다르다`);
        if (at < base.now) bad('arrive.payload.at', `지금 시각 ${base.now} 보다 앞이다`);

        if (outcome === 'hit') {
          if (!base.cached) bad('arrive.payload.outcome', '엣지가 비었는데 적중이다');
          const wait = num(p.wait, 'arrive.payload.wait');
          return {
            ...scene,
            requests: scene.requests.map((r) => (r.id === id ? { ...r, state: 'served', wait } : { ...r })),
            queue: [...scene.queue],
            now: at,
            originCalls,
            step: { kind: 'hit', id, was: base.now },
          };
        }
        if (outcome === 'miss') {
          if (base.cached) bad('arrive.payload.outcome', '엣지가 들고 있는데 실패다');
          if (scene.fetch !== null) bad('arrive.payload.outcome', '가져오기가 가는 중인데 새로 열었다');
          const end = num(p.fetchEnd, 'arrive.payload.fetchEnd');
          if (end <= at) bad('arrive.payload.fetchEnd', '도착보다 앞이다');
          return {
            ...scene,
            requests: scene.requests.map((r) => (r.id === id ? { ...r, state: 'waiting' } : { ...r })),
            queue: [...scene.queue, id],
            fetch: { start: at, end },
            now: at,
            originCalls,
            step: { kind: 'miss', id, was: base.now },
          };
        }
        if (outcome === 'join') {
          if (base.cached) bad('arrive.payload.outcome', '엣지가 들고 있는데 합류다');
          if (scene.fetch === null) bad('arrive.payload.outcome', '가는 중인 가져오기가 없는데 합류다');
          if (at > scene.fetch.end) bad('arrive.payload.at', '가져오기가 이미 끝났을 시각이다');
          return {
            ...scene,
            requests: scene.requests.map((r) => (r.id === id ? { ...r, state: 'waiting' } : { ...r })),
            queue: [...scene.queue, id],
            fetch: { ...scene.fetch },
            now: at,
            originCalls,
            step: { kind: 'join', id, was: base.now },
          };
        }
        return bad('arrive.payload.outcome', `모르는 갈래: ${String(outcome)}`);
      }

      case 'response': {
        const base = ready(scene, 'response');
        const p = rec(event.payload, 'response.payload');
        const at = num(p.at, 'response.payload.at');
        const originCalls = num(p.originCalls, 'response.payload.originCalls');
        if (scene.fetch === null) bad('response', '가는 중인 가져오기가 없다');
        if (at !== scene.fetch.end) bad('response.payload.at', `가져오기 끝 ${scene.fetch.end} 과 다르다`);
        const list = p.delivered;
        if (!Array.isArray(list)) bad('response.payload.delivered', '배열이 아니다');
        const waits = new Map<string, number>();
        list.forEach((d: unknown, i: number) => {
          const q = rec(d, `response.payload.delivered[${i}]`);
          waits.set(str(q.id, `response.payload.delivered[${i}].id`), num(q.wait, `response.payload.delivered[${i}].wait`));
        });
        const ids = [...waits.keys()];
        if (ids.length !== scene.queue.length || ids.some((id, i) => scene.queue[i] !== id)) {
          bad('response.payload.delivered', '기다리던 줄과 다르다');
        }
        return {
          ...scene,
          requests: scene.requests.map((r) => {
            const w = waits.get(r.id);
            return w === undefined ? { ...r } : { ...r, state: 'served', wait: w };
          }),
          queue: [],
          fetch: null,
          cached: true,
          now: at,
          originCalls,
          step: { kind: 'response', ids, was: base.now, fetchStart: scene.fetch.start },
        };
      }

      default:
        throw new Error(`originPullScene: 모르는 이벤트 ${event.type}`);
    }
  },
};

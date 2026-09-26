import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowDecoupleData } from './algorithm.js';

/** 한 발행의 기록 — 몇 번째 · 값 · 그때 보내는 쪽이 안 것의 수 · 받은 곳. */
export type PublishRecord = { nth: number; value: number; knownCount: number; reached: string[] };

export type DecoupleStep =
  | { kind: 'publish'; nth: number; value: number; reached: string[] }
  | { kind: 'join'; id: string }
  | { kind: 'leave'; id: string };

/** init 이 한 번 채우고 걸음이 쌓는 것. */
export type DecoupleLive = {
  known: string[];
  subscribers: string[];
  inbox: { id: string; got: number[] }[];
  publishTotal: number;
  ledger: PublishRecord[];
};

export type DecoupleScene = {
  /** 바탕 — initialData 에서 */
  topic: string;
  candidates: string[];
  /** init 전에는 null (셈할 값은 알고리즘이 silent init 으로 보낸다) */
  live: DecoupleLive | null;
  /** 이번 걸음 */
  step: DecoupleStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`decoupleSenderReceiverScene: ${path} — ${why}`);
}

function field(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function strings(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) fail(path, '배열이 아니다');
  return v.map((s, i) => {
    if (typeof s !== 'string') fail(`${path}[${i}]`, '문자열이 아니다');
    return s;
  });
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '수가 아니다');
  return v;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function needLive(scene: DecoupleScene, type: string): DecoupleLive {
  if (!scene.live) fail(type, 'init 전에 왔다');
  return scene.live;
}

export const decoupleSenderReceiverScene: ScenePlan<DecoupleScene> = {
  initial(initialData: unknown): DecoupleScene {
    const data = narrowDecoupleData(initialData);
    return { topic: data.topic, candidates: [...data.candidates], live: null, step: null };
  },

  reduce(scene: DecoupleScene, event: FacetRuntimeEvent): DecoupleScene {
    switch (event.type) {
      case 'init': {
        const p = field(event);
        const known = strings(p.known, 'init.known');
        const subscribers = strings(p.subscribers, 'init.subscribers');
        for (const id of subscribers) {
          if (!scene.candidates.includes(id)) fail('init.subscribers', `후보에 없는 구독자 ${id}`);
        }
        if (!Array.isArray(p.inbox)) fail('init.inbox', '배열이 아니다');
        const inbox = p.inbox.map((row, i) => {
          if (typeof row !== 'object' || row === null) fail(`init.inbox[${i}]`, '객체가 아니다');
          const r = row as Record<string, unknown>;
          if (typeof r.id !== 'string' || r.id !== scene.candidates[i]) {
            fail(`init.inbox[${i}].id`, `후보 차례와 다르다 ${String(r.id)}`);
          }
          if (!Array.isArray(r.got)) fail(`init.inbox[${i}].got`, '배열이 아니다');
          return { id: r.id, got: r.got.map((g, j) => num(g, `init.inbox[${i}].got[${j}]`)) };
        });
        if (inbox.length !== scene.candidates.length) fail('init.inbox', '후보 수와 다르다');
        const publishTotal = num(p.publishTotal, 'init.publishTotal');
        return { ...scene, live: { known, subscribers, inbox, publishTotal, ledger: [] }, step: null };
      }
      case 'publish': {
        const live = needLive(scene, 'publish');
        const p = field(event);
        const nth = num(p.nth, 'publish.nth');
        const value = num(p.value, 'publish.value');
        const known = strings(p.known, 'publish.known');
        const reached = strings(p.reached, 'publish.reached');
        if (nth !== live.ledger.length + 1) fail('publish.nth', `앞 발행 수와 맞지 않는다 ${nth}`);
        if (nth > live.publishTotal) fail('publish.nth', `발행 수를 넘었다 ${nth}`);
        if (!sameList(reached, live.subscribers)) fail('publish.reached', '지금 구독자 목록과 다르다');
        const inbox = live.inbox.map((row) =>
          reached.includes(row.id) ? { id: row.id, got: [...row.got, value] } : { id: row.id, got: [...row.got] },
        );
        const ledger = [...live.ledger, { nth, value, knownCount: known.length, reached: [...reached] }];
        return {
          ...scene,
          live: { ...live, known: [...known], subscribers: [...live.subscribers], inbox, ledger },
          step: { kind: 'publish', nth, value, reached: [...reached] },
        };
      }
      case 'join':
      case 'leave': {
        const live = needLive(scene, event.type);
        const p = field(event);
        if (typeof p.id !== 'string' || !scene.candidates.includes(p.id)) {
          fail(`${event.type}.id`, `후보에 없는 구독자 ${String(p.id)}`);
        }
        const id = p.id;
        const after = strings(p.subscribers, `${event.type}.subscribers`);
        if (event.type === 'join') {
          if (live.subscribers.includes(id)) fail('join.id', `이미 구독 ${id}`);
          if (!sameList(after, [...live.subscribers, id])) fail('join.subscribers', '앞 목록에 하나를 더한 것이 아니다');
        } else {
          if (!live.subscribers.includes(id)) fail('leave.id', `구독 안 함 ${id}`);
          if (!sameList(after, live.subscribers.filter((s) => s !== id))) {
            fail('leave.subscribers', '앞 목록에서 하나를 뺀 것이 아니다');
          }
        }
        return {
          ...scene,
          live: {
            ...live,
            known: [...live.known],
            subscribers: after,
            inbox: live.inbox.map((row) => ({ id: row.id, got: [...row.got] })),
            ledger: live.ledger.map((r) => ({ ...r, reached: [...r.reached] })),
          },
          step: event.type === 'join' ? { kind: 'join', id } : { kind: 'leave', id },
        };
      }
      default:
        return fail('event.type', `모르는 이벤트 ${event.type}`);
    }
  },
};

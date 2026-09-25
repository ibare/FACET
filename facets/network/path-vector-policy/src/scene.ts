import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readPathVectorPolicyData, type RelationPref, type RouteAd } from './algorithm';

/** 걸러진 길 — 보낸 이웃과 그 길에서 내 번호의 자리 */
export interface DroppedRoute {
  from: number;
  at: number;
}

export interface ScoredRoute {
  from: number;
  pref: number;
  length: number;
}

export interface PickResult {
  chosen: number;
  shortest: number;
  shortestRank: number;
}

export type PathVectorStep =
  | { kind: 'start' }
  | { kind: 'arrive' }
  | { kind: 'loop' }
  | { kind: 'rank' }
  | { kind: 'pick' };

export interface PathVectorPolicyScene {
  // 바탕 — initialData 에서 한 번
  me: number;
  prefix: string;
  prefs: RelationPref[];
  routes: RouteAd[];
  // 자취 — 걸음이 쌓는 것
  arrived: boolean;
  /** 고리 거르기를 지났는가 */
  filtered: boolean;
  dropped: DroppedRoute[];
  /** 남은 길의 보낸 이웃 (받은 차례) */
  kept: number[];
  /** 매긴 선호 (받은 차례). 매기기 전에는 빈 줄 */
  scored: ScoredRoute[];
  /** 세운 차례. 고르기 전에는 빈 줄 */
  order: number[];
  pick: PickResult | null;
  // 이번 걸음
  step: PathVectorStep;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numberList(v: unknown, where: string): number[] {
  if (!Array.isArray(v)) throw new Error(`path-vector-policy scene: ${where} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number') throw new Error(`path-vector-policy scene: ${where}[${i}] 가 수가 아니다`);
    return x;
  });
}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number') throw new Error(`path-vector-policy scene: ${where} 가 수가 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`path-vector-policy scene: ${event.type} 의 payload 가 없다`);
  return event.payload;
}

export const pathVectorPolicyScene: ScenePlan<PathVectorPolicyScene> = {
  initial(initialData: unknown): PathVectorPolicyScene {
    const data = readPathVectorPolicyData(initialData);
    return {
      me: data.me,
      prefix: data.prefix,
      prefs: data.prefs.map((p) => ({ rel: p.rel, pref: p.pref })),
      routes: data.routes.map((r) => ({ from: r.from, rel: r.rel, path: [...r.path] })),
      arrived: false,
      filtered: false,
      dropped: [],
      kept: [],
      scored: [],
      order: [],
      pick: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: PathVectorPolicyScene, event: FacetRuntimeEvent): PathVectorPolicyScene {
    switch (event.type) {
      case 'arrive': {
        numberList(payloadOf(event).neighbors, 'arrive.neighbors');
        return { ...scene, arrived: true, step: { kind: 'arrive' } };
      }
      case 'loop': {
        const p = payloadOf(event);
        if (!Array.isArray(p.dropped)) throw new Error('path-vector-policy scene: loop.dropped 가 배열이 아니다');
        const dropped = p.dropped.map((d, i): DroppedRoute => {
          if (!isRecord(d)) throw new Error(`path-vector-policy scene: loop.dropped[${i}] 가 객체가 아니다`);
          return { from: num(d.from, `loop.dropped[${i}].from`), at: num(d.at, `loop.dropped[${i}].at`) };
        });
        const kept = numberList(p.kept, 'loop.kept');
        return { ...scene, filtered: true, dropped, kept, step: { kind: 'loop' } };
      }
      case 'rank': {
        const p = payloadOf(event);
        if (!Array.isArray(p.prefs)) throw new Error('path-vector-policy scene: rank.prefs 가 배열이 아니다');
        const scored = p.prefs.map((s, i): ScoredRoute => {
          if (!isRecord(s)) throw new Error(`path-vector-policy scene: rank.prefs[${i}] 가 객체가 아니다`);
          return {
            from: num(s.from, `rank.prefs[${i}].from`),
            pref: num(s.pref, `rank.prefs[${i}].pref`),
            length: num(s.length, `rank.prefs[${i}].length`),
          };
        });
        return { ...scene, scored, step: { kind: 'rank' } };
      }
      case 'pick': {
        const p = payloadOf(event);
        const order = numberList(p.order, 'pick.order');
        const pick: PickResult = {
          chosen: num(p.chosen, 'pick.chosen'),
          shortest: num(p.shortest, 'pick.shortest'),
          shortestRank: num(p.shortestRank, 'pick.shortestRank'),
        };
        return { ...scene, order, pick, step: { kind: 'pick' } };
      }
      default:
        return scene;
    }
  },
};

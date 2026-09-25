/**
 * 장면 — 바탕(길 위의 라우터와 두 끝) · 자취(돌아온 답들) · 이번 걸음.
 *
 * 셈은 알고리즘이 한다. 장면은 `probe` · `done` 이벤트를 잇기만 한다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type TtlBase = {
  sender: string;
  routers: { name: string; addr: string }[];
  destination: string;
};

export type TtlAnswer = {
  ttl: number;
  port: number;
  /** 지난 라우터마다 줄인 뒤의 TTL */
  trail: number[];
  fate: 'expired' | 'arrived';
  /** expired: 버린 라우터 차례 · arrived: 라우터 수(목적지 자리) */
  at: number;
  left: number;
  from: string;
  icmpType: number;
  icmpCode: number;
};

export type TtlStep =
  | { kind: 'ready' }
  | { kind: 'probe'; index: number }
  | { kind: 'done'; probes: number; routers: number };

export type TtlExpiredReportsScene = {
  base: TtlBase | null;
  answers: TtlAnswer[];
  step: TtlStep;
};

function readBase(data: unknown): TtlBase | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.sender !== 'string' || typeof d.destination !== 'string' || !Array.isArray(d.routers)) return null;
  const routers: { name: string; addr: string }[] = [];
  for (const r of d.routers) {
    if (typeof r !== 'object' || r === null) return null;
    const o = r as Record<string, unknown>;
    if (typeof o.name !== 'string' || typeof o.addr !== 'string') return null;
    routers.push({ name: o.name, addr: o.addr });
  }
  return { sender: d.sender, routers, destination: d.destination };
}

function readAnswer(p: unknown): TtlAnswer {
  if (typeof p !== 'object' || p === null) throw new Error('ttl-expired-reports: probe payload 가 없다');
  const o = p as Record<string, unknown>;
  const { ttl, port, trail, fate, at, left, from, icmpType, icmpCode } = o;
  if (
    typeof ttl !== 'number' ||
    typeof port !== 'number' ||
    !Array.isArray(trail) ||
    (fate !== 'expired' && fate !== 'arrived') ||
    typeof at !== 'number' ||
    typeof left !== 'number' ||
    typeof from !== 'string' ||
    typeof icmpType !== 'number' ||
    typeof icmpCode !== 'number'
  ) {
    throw new Error('ttl-expired-reports: probe payload 모양이 틀렸다');
  }
  const nums: number[] = [];
  for (const v of trail) {
    if (typeof v !== 'number') throw new Error('ttl-expired-reports: trail 에 수가 아닌 값');
    nums.push(v);
  }
  return { ttl, port, trail: nums, fate, at, left, from, icmpType, icmpCode };
}

export const ttlExpiredReportsScene: ScenePlan<TtlExpiredReportsScene> = {
  initial(initialData: unknown): TtlExpiredReportsScene {
    return { base: readBase(initialData), answers: [], step: { kind: 'ready' } };
  },
  reduce(scene: TtlExpiredReportsScene, event: FacetRuntimeEvent): TtlExpiredReportsScene {
    if (event.type === 'probe') {
      const answer = readAnswer(event.payload);
      const answers = [...scene.answers, answer];
      return { base: scene.base, answers, step: { kind: 'probe', index: answers.length - 1 } };
    }
    if (event.type === 'done') {
      const p = event.payload;
      if (typeof p !== 'object' || p === null) throw new Error('ttl-expired-reports: done payload 가 없다');
      const o = p as Record<string, unknown>;
      if (typeof o.probes !== 'number' || typeof o.routers !== 'number') {
        throw new Error('ttl-expired-reports: done payload 모양이 틀렸다');
      }
      return { base: scene.base, answers: scene.answers, step: { kind: 'done', probes: o.probes, routers: o.routers } };
    }
    return scene;
  },
};

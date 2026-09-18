/**
 * 앞질러 가져오기 — 장면.
 *
 *   바탕   base   init 이 한 번 정한다 (원소 수 · 줄 크기 · 지연 · 시간 띠 눈금 · 줄기들)
 *   자취   lanes  줄기마다 지금까지 부른 줄 · 읽은 원소 · 끝났으면 그 셈
 *          clock  지금까지 흐른 사이클
 *   걸음   step   이번 걸음이 흘린 사이클 구간 [from, to)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import type { ElementRead, LaneDone, LineRequest, Policy, TickLane } from './algorithm.js';

export type FetchAheadBase = {
  n: number;
  lineSize: number;
  latency: number;
  horizon: number;
  policies: Policy[];
};

export type LaneTrace = {
  requests: LineRequest[];
  reads: ElementRead[];
  done: LaneDone | null;
};

export type FetchAheadScene = {
  base: FetchAheadBase | null;
  lanes: LaneTrace[];
  clock: number;
  step: { from: number; to: number } | null;
};

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function policyOf(v: unknown): Policy | null {
  return v === 'none' || v === 'nextLine' ? v : null;
}

function requestOf(v: unknown): LineRequest {
  const o = rec(v);
  return { line: num(o['line']), at: num(o['at']), arrive: num(o['arrive']) };
}

function readOf(v: unknown): ElementRead {
  const o = rec(v);
  return { elem: num(o['elem']), at: num(o['at']) };
}

function doneOf(v: unknown): LaneDone | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = rec(v);
  return { total: num(o['total']), waited: num(o['waited']) };
}

function tickLaneOf(v: unknown): TickLane {
  const o = rec(v);
  return {
    requests: list(o['requests']).map(requestOf),
    reads: list(o['reads']).map(readOf),
    done: doneOf(o['done']),
  };
}

export const fetchAheadScene: ScenePlan<FetchAheadScene> = {
  initial(): FetchAheadScene {
    return { base: null, lanes: [], clock: 0, step: null };
  },
  reduce(scene: FetchAheadScene, event: FacetRuntimeEvent): FetchAheadScene {
    if (event.type === 'init') {
      const p = rec(event.payload);
      const policies = list(p['policies'])
        .map(policyOf)
        .filter((x): x is Policy => x !== null);
      return {
        base: {
          n: num(p['n']),
          lineSize: Math.max(1, num(p['lineSize'])),
          latency: num(p['latency']),
          horizon: Math.max(1, num(p['horizon'])),
          policies,
        },
        lanes: policies.map(() => ({ requests: [], reads: [], done: null })),
        clock: 0,
        step: null,
      };
    }
    if (event.type === 'tick') {
      const p = rec(event.payload);
      const adds = list(p['lanes']).map(tickLaneOf);
      return {
        base: scene.base,
        lanes: scene.lanes.map((lane, i) => {
          const add = adds[i];
          if (!add) return lane;
          return {
            requests: [...lane.requests, ...add.requests],
            reads: [...lane.reads, ...add.reads],
            done: add.done ?? lane.done,
          };
        }),
        clock: num(p['to']),
        step: { from: num(p['from']), to: num(p['to']) },
      };
    }
    return scene;
  },
};

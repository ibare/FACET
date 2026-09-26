/**
 * carry-velocity 의 장면.
 *
 * 바탕(base) — 자료에서 베낀 구간 · 계수 · 처음 자리, 그리고 silent init 이 채우는 셈한 틀(frame).
 * 자취(rows) — 갱신마다 한 줄씩 쌓인다.
 * 이번 걸음(step) — 처음 모습이거나 k 번째 갱신.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowCarryVelocityData,
  type CarryVelocityPiece,
  type CarryVelocityRow,
} from './algorithm.js';

export type CarryVelocityBase = {
  breaks: number[];
  pieces: CarryVelocityPiece[];
  beta: number;
  eta: number;
  w0: number;
  v0: number;
};

export type CarryVelocityFrame = { loss0: number; lo: number; hi: number; updates: number };

export type CarryVelocityStep = { kind: 'start' } | { kind: 'update'; k: number };

export type CarryVelocityScene = {
  base: CarryVelocityBase;
  frame: CarryVelocityFrame | null;
  rows: CarryVelocityRow[];
  step: CarryVelocityStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const x = p[key];
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new Error(`carryVelocityScene: ${type}.payload.${key} 가 유한한 수가 아니다`);
  }
  return x;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`carryVelocityScene: ${event.type}.payload 가 객체가 아니다`);
  return event.payload;
}

export const carryVelocityScene: ScenePlan<CarryVelocityScene> = {
  initial(initialData: unknown): CarryVelocityScene {
    const d = narrowCarryVelocityData(initialData);
    return {
      base: {
        breaks: [...d.breaks],
        pieces: d.pieces.map((p) => ({ ...p })),
        beta: d.beta,
        eta: d.eta,
        w0: d.w0,
        v0: d.v0,
      },
      frame: null,
      rows: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: CarryVelocityScene, event: FacetRuntimeEvent): CarryVelocityScene {
    switch (event.type) {
      case 'init': {
        if (scene.frame !== null) throw new Error('carryVelocityScene: init 이 두 번 왔다');
        const p = payloadOf(event);
        const updates = num(p, 'updates', 'init');
        if (!Number.isInteger(updates) || updates < 1) {
          throw new Error('carryVelocityScene: init.payload.updates 가 1 이상의 정수가 아니다');
        }
        return {
          ...scene,
          frame: { loss0: num(p, 'loss0', 'init'), lo: num(p, 'lo', 'init'), hi: num(p, 'hi', 'init'), updates },
          step: { kind: 'start' },
        };
      }
      case 'update': {
        if (scene.frame === null) throw new Error('carryVelocityScene: init 앞에 update 가 왔다');
        const p = payloadOf(event);
        const row: CarryVelocityRow = {
          k: num(p, 'k', 'update'),
          from: num(p, 'from', 'update'),
          vPrev: num(p, 'vPrev', 'update'),
          g: num(p, 'g', 'update'),
          carried: num(p, 'carried', 'update'),
          push: num(p, 'push', 'update'),
          v: num(p, 'v', 'update'),
          to: num(p, 'to', 'update'),
          loss: num(p, 'loss', 'update'),
        };
        const last = scene.rows[scene.rows.length - 1];
        const w = last ? last.to : scene.base.w0;
        const v = last ? last.v : scene.base.v0;
        if (row.k !== scene.rows.length + 1) {
          throw new Error(`carryVelocityScene: update.payload.k=${row.k} 가 차례(${scene.rows.length + 1})와 다르다`);
        }
        if (row.k > scene.frame.updates) throw new Error('carryVelocityScene: 갱신 수를 넘었다');
        if (row.from !== w) throw new Error(`carryVelocityScene: update.payload.from=${row.from} 가 지금 자리 ${w} 가 아니다`);
        if (row.vPrev !== v) throw new Error(`carryVelocityScene: update.payload.vPrev=${row.vPrev} 가 지금 움직임 ${v} 가 아니다`);
        return { ...scene, rows: [...scene.rows, row], step: { kind: 'update', k: row.k } };
      }
      default:
        throw new Error(`carryVelocityScene: 모르는 이벤트 ${event.type}`);
    }
  },
};

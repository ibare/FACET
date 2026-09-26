/**
 * trapdoor-with-key 장면.
 *
 * 바탕 — 공개 n · e, 숨긴 p · q, 평문 목록 (initialData 에서 베낀다).
 * 자취 — φ, 열쇠 d 와 그 확인, 평문마다 잠긴 값 · 돌아온 값.
 * 이번 걸음 — step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowTrapdoorData } from './algorithm.js';

export type TrapdoorLane = {
  /** 처음 평문 */
  plain: number;
  /** c = plain^e mod n — 잠그기 전이면 null */
  cipher: number | null;
  /** cipher^d mod n — 풀기 전이면 null */
  back: number | null;
};

export type TrapdoorKey = {
  d: number;
  product: number;
  quotient: number;
  remainder: number;
};

export type TrapdoorStep =
  | { kind: 'start' }
  | { kind: 'phi' }
  | { kind: 'key' }
  | { kind: 'lock'; index: number }
  | { kind: 'unlock'; index: number };

export type TrapdoorScene = {
  n: number;
  e: number;
  p: number;
  q: number;
  phi: number | null;
  key: TrapdoorKey | null;
  lanes: TrapdoorLane[];
  step: TrapdoorStep;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`trapdoorWithKeyScene: '${event.type}' 의 payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function int(o: Record<string, unknown>, key: string, type: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`trapdoorWithKeyScene: '${type}' payload.${key} 가 정수가 아니다 (${String(v)})`);
  }
  return v;
}

function laneAt(scene: TrapdoorScene, index: number, type: string): TrapdoorLane {
  const lane = scene.lanes[index];
  if (!lane) throw new Error(`trapdoorWithKeyScene: '${type}' payload.index ${index} 에 평문이 없다`);
  return lane;
}

function withLane(scene: TrapdoorScene, index: number, lane: TrapdoorLane): TrapdoorLane[] {
  return scene.lanes.map((l, i) => (i === index ? lane : { ...l }));
}

export const trapdoorWithKeyScene: ScenePlan<TrapdoorScene> = {
  initial(initialData: unknown): TrapdoorScene {
    const data = narrowTrapdoorData(initialData);
    return {
      n: data.n,
      e: data.e,
      p: data.p,
      q: data.q,
      phi: null,
      key: null,
      lanes: data.plains.map((plain) => ({ plain, cipher: null, back: null })),
      step: { kind: 'start' },
    };
  },

  reduce(scene: TrapdoorScene, event: FacetRuntimeEvent): TrapdoorScene {
    switch (event.type) {
      case 'phi': {
        const o = payloadOf(event);
        const p = int(o, 'p', 'phi');
        const q = int(o, 'q', 'phi');
        const phi = int(o, 'phi', 'phi');
        if (p !== scene.p || q !== scene.q) {
          throw new Error(`trapdoorWithKeyScene: 'phi' payload.p · q (${p} · ${q}) 가 바탕 (${scene.p} · ${scene.q}) 과 다르다`);
        }
        if (scene.phi !== null) throw new Error("trapdoorWithKeyScene: 'phi' 가 두 번 왔다");
        return { ...scene, lanes: scene.lanes.map((l) => ({ ...l })), phi, step: { kind: 'phi' } };
      }
      case 'key': {
        const o = payloadOf(event);
        const e = int(o, 'e', 'key');
        const phi = int(o, 'phi', 'key');
        const key: TrapdoorKey = {
          d: int(o, 'd', 'key'),
          product: int(o, 'product', 'key'),
          quotient: int(o, 'quotient', 'key'),
          remainder: int(o, 'remainder', 'key'),
        };
        if (scene.phi === null) throw new Error("trapdoorWithKeyScene: 'key' 가 'phi' 보다 먼저 왔다");
        if (e !== scene.e) throw new Error(`trapdoorWithKeyScene: 'key' payload.e ${e} 가 바탕 e ${scene.e} 와 다르다`);
        if (phi !== scene.phi) throw new Error(`trapdoorWithKeyScene: 'key' payload.phi ${phi} 가 장면의 φ ${scene.phi} 와 다르다`);
        if (scene.key !== null) throw new Error("trapdoorWithKeyScene: 'key' 가 두 번 왔다");
        return { ...scene, lanes: scene.lanes.map((l) => ({ ...l })), key, step: { kind: 'key' } };
      }
      case 'lock': {
        const o = payloadOf(event);
        const index = int(o, 'index', 'lock');
        const m = int(o, 'm', 'lock');
        const c = int(o, 'c', 'lock');
        const lane = laneAt(scene, index, 'lock');
        if (lane.plain !== m) throw new Error(`trapdoorWithKeyScene: 'lock' payload.m ${m} 가 평문 ${lane.plain} 과 다르다`);
        if (lane.cipher !== null) throw new Error(`trapdoorWithKeyScene: 'lock' index ${index} 는 이미 잠겼다`);
        return { ...scene, lanes: withLane(scene, index, { ...lane, cipher: c }), step: { kind: 'lock', index } };
      }
      case 'unlock': {
        const o = payloadOf(event);
        const index = int(o, 'index', 'unlock');
        const c = int(o, 'c', 'unlock');
        const m = int(o, 'm', 'unlock');
        const lane = laneAt(scene, index, 'unlock');
        if (scene.key === null) throw new Error("trapdoorWithKeyScene: 'unlock' 가 'key' 보다 먼저 왔다");
        if (lane.cipher !== c) {
          throw new Error(`trapdoorWithKeyScene: 'unlock' payload.c ${c} 가 잠긴 값 ${String(lane.cipher)} 과 다르다`);
        }
        if (lane.back !== null) throw new Error(`trapdoorWithKeyScene: 'unlock' index ${index} 는 이미 풀렸다`);
        return { ...scene, lanes: withLane(scene, index, { ...lane, back: m }), step: { kind: 'unlock', index } };
      }
      default:
        throw new Error(`trapdoorWithKeyScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};

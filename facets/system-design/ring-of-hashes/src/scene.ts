import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readRingData } from './algorithm.js';

/** 키가 잡은 자리와 걸어서 닿은 주인. */
export type KeySeat = {
  pos: number;
  owner: string;
  dist: number;
  wrapped: boolean;
};

export type RingStep =
  | { kind: 'start' }
  | { kind: 'server'; server: string }
  | { kind: 'key'; key: string };

export type RingScene = {
  /** 바탕 — 고리 크기와 대기열 (initialData 에서 베낀다) */
  size: number;
  servers: string[];
  keys: string[];
  /** 자취 — servers 와 같은 차례. 아직 자리를 못 잡았으면 null */
  serverPos: (number | null)[];
  /** 자취 — keys 와 같은 차례. 아직 자리를 못 잡았으면 null */
  keySeats: (KeySeat | null)[];
  /** 이번 걸음 */
  step: RingStep;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`ringOfHashesScene: ${event.type} 의 payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function readPos(value: unknown, size: number, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= size) {
    throw new Error(`ringOfHashesScene: ${path} 가 고리 자리 0..${size - 1} 가 아니다 (${String(value)})`);
  }
  return value;
}

export const ringOfHashesScene: ScenePlan<RingScene> = {
  initial(initialData: unknown): RingScene {
    const data = readRingData(initialData);
    return {
      size: data.size,
      servers: [...data.servers],
      keys: [...data.keys],
      serverPos: data.servers.map(() => null),
      keySeats: data.keys.map(() => null),
      step: { kind: 'start' },
    };
  },

  reduce(scene: RingScene, event: FacetRuntimeEvent): RingScene {
    switch (event.type) {
      case 'server-place': {
        const p = payloadOf(event);
        const server = p.server;
        if (typeof server !== 'string') throw new Error('ringOfHashesScene: server-place.payload.server 가 문자열이 아니다');
        const i = scene.servers.indexOf(server);
        if (i < 0) throw new Error(`ringOfHashesScene: server-place.payload.server "${server}" 가 서버 목록에 없다`);
        if (scene.serverPos[i] !== null) {
          throw new Error(`ringOfHashesScene: server-place.payload.server "${server}" 는 이미 자리를 잡았다`);
        }
        if (scene.keySeats.some((k) => k !== null)) {
          throw new Error('ringOfHashesScene: 키가 자리를 잡은 뒤에 서버가 들어왔다');
        }
        const pos = readPos(p.pos, scene.size, 'server-place.payload.pos');
        if (scene.serverPos.includes(pos)) {
          throw new Error(`ringOfHashesScene: server-place.payload.pos ${pos} 에 이미 서버가 있다`);
        }
        const serverPos = [...scene.serverPos];
        serverPos[i] = pos;
        return {
          size: scene.size,
          servers: [...scene.servers],
          keys: [...scene.keys],
          serverPos,
          keySeats: scene.keySeats.map((k) => (k === null ? null : { ...k })),
          step: { kind: 'server', server },
        };
      }
      case 'key-place': {
        const p = payloadOf(event);
        const { key, owner, dist, wrapped } = p;
        if (typeof key !== 'string') throw new Error('ringOfHashesScene: key-place.payload.key 가 문자열이 아니다');
        const i = scene.keys.indexOf(key);
        if (i < 0) throw new Error(`ringOfHashesScene: key-place.payload.key "${key}" 가 키 목록에 없다`);
        if (scene.keySeats[i] !== null) {
          throw new Error(`ringOfHashesScene: key-place.payload.key "${key}" 는 이미 자리를 잡았다`);
        }
        const pos = readPos(p.pos, scene.size, 'key-place.payload.pos');
        if (typeof owner !== 'string') throw new Error('ringOfHashesScene: key-place.payload.owner 가 문자열이 아니다');
        const oi = scene.servers.indexOf(owner);
        if (oi < 0) throw new Error(`ringOfHashesScene: key-place.payload.owner "${owner}" 가 서버 목록에 없다`);
        const ownerPos = scene.serverPos[oi];
        if (ownerPos === null || ownerPos === undefined) {
          throw new Error(`ringOfHashesScene: key-place.payload.owner "${owner}" 는 아직 고리에 없다`);
        }
        if (typeof dist !== 'number' || !Number.isInteger(dist) || dist < 0 || dist >= scene.size) {
          throw new Error(`ringOfHashesScene: key-place.payload.dist 가 0..${scene.size - 1} 가 아니다`);
        }
        if ((pos + dist) % scene.size !== ownerPos) {
          throw new Error(`ringOfHashesScene: key-place.payload.dist ${dist} 가 ${pos} 에서 ${owner}(${ownerPos}) 에 닿지 않는다`);
        }
        if (typeof wrapped !== 'boolean') throw new Error('ringOfHashesScene: key-place.payload.wrapped 가 참거짓이 아니다');
        if (wrapped !== pos + dist >= scene.size) {
          throw new Error('ringOfHashesScene: key-place.payload.wrapped 가 걸은 길과 맞지 않는다');
        }
        const keySeats = scene.keySeats.map((k) => (k === null ? null : { ...k }));
        keySeats[i] = { pos, owner, dist, wrapped };
        return {
          size: scene.size,
          servers: [...scene.servers],
          keys: [...scene.keys],
          serverPos: [...scene.serverPos],
          keySeats,
          step: { kind: 'key', key },
        };
      }
      default:
        throw new Error(`ringOfHashesScene: 모르는 이벤트 "${event.type}"`);
    }
  },
};

/**
 * hop-by-hop 장면 — 이벤트를 잇기만 한다. 틱의 셈은 알고리즘이 한다.
 *
 * 바탕: 마디 · 패킷 · 전체 틱 수
 * 자취: 패킷마다 지금 있는 마디 · 링크가 쓰인 기록 · 패킷마다 도착한 틱
 * 이번 걸음: 이번 틱의 옮김과 옮기기 전 자리(was)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readHopByHopData } from './algorithm.js';

export type HopSceneMove = { packet: number; from: number; to: number };

/** 링크 link 가 틱 t 동안 packet 을 날랐다 */
export type HopUse = { t: number; link: number; packet: number };

export type HopStep =
  | { kind: 'start' }
  | { kind: 'tick'; t: number; moves: HopSceneMove[]; was: number[]; last: boolean };

export type HopByHopScene = {
  nodes: string[];
  packets: string[];
  /** 알고리즘이 셈한 전체 틱 수. init 전에는 null */
  tickCount: number | null;
  /** 패킷마다 지금 있는 마디 번호 */
  at: number[];
  uses: HopUse[];
  /** 패킷마다 끝 마디에 닿은 틱. 아직이면 null */
  arrivedAt: (number | null)[];
  step: HopStep;
};

function readMoves(raw: unknown, packetCount: number, nodeCount: number): HopSceneMove[] {
  if (!Array.isArray(raw)) throw new Error('hop-by-hop 장면: moves 가 배열이 아니다');
  return raw.map((m: unknown, k) => {
    if (typeof m !== 'object' || m === null) throw new Error(`hop-by-hop 장면: moves[${k}] 가 객체가 아니다`);
    const o = m as Record<string, unknown>;
    const packet = o['packet'];
    const from = o['from'];
    const to = o['to'];
    if (typeof packet !== 'number' || typeof from !== 'number' || typeof to !== 'number') {
      throw new Error(`hop-by-hop 장면: moves[${k}] 의 칸이 수가 아니다`);
    }
    if (packet < 0 || packet >= packetCount) throw new Error(`hop-by-hop 장면: 없는 패킷 ${packet}`);
    if (from < 0 || to >= nodeCount || to !== from + 1) {
      throw new Error(`hop-by-hop 장면: 이웃이 아닌 옮김 ${from} → ${to}`);
    }
    return { packet, from, to };
  });
}

export const hopByHopScene: ScenePlan<HopByHopScene> = {
  initial(initialData: unknown): HopByHopScene {
    const data = readHopByHopData(initialData);
    return {
      nodes: [...data.nodes],
      packets: [...data.packets],
      tickCount: null,
      at: data.packets.map(() => 0),
      uses: [],
      arrivedAt: data.packets.map(() => null),
      step: { kind: 'start' },
    };
  },

  reduce(scene: HopByHopScene, event: FacetRuntimeEvent): HopByHopScene {
    const p = event.payload;
    if (typeof p !== 'object' || p === null) return scene;
    const payload = p as Record<string, unknown>;

    if (event.type === 'init') {
      const tickCount = payload['tickCount'];
      if (typeof tickCount !== 'number') throw new Error('hop-by-hop 장면: tickCount 가 수가 아니다');
      return { ...scene, tickCount };
    }

    if (event.type === 'tick') {
      const t = payload['t'];
      const last = payload['last'];
      if (typeof t !== 'number') throw new Error('hop-by-hop 장면: t 가 수가 아니다');
      if (typeof last !== 'boolean') throw new Error('hop-by-hop 장면: last 가 참거짓이 아니다');
      const moves = readMoves(payload['moves'], scene.packets.length, scene.nodes.length);
      const end = scene.nodes.length - 1;
      const was = [...scene.at];
      const at = [...scene.at];
      const arrivedAt = [...scene.arrivedAt];
      const uses = scene.uses.map((u) => ({ ...u }));
      for (const m of moves) {
        if (was[m.packet] !== m.from) {
          throw new Error(`hop-by-hop 장면: 패킷 ${m.packet} 은 마디 ${m.from} 에 없다`);
        }
        at[m.packet] = m.to;
        uses.push({ t, link: m.from, packet: m.packet });
        if (m.to === end) arrivedAt[m.packet] = t;
      }
      return {
        ...scene,
        at,
        uses,
        arrivedAt,
        step: { kind: 'tick', t, moves: moves.map((m) => ({ ...m })), was, last },
      };
    }

    return scene;
  },
};

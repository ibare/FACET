/**
 * jitteredBackoff 장면 — 알고리즘이 보낸 칸마다의 기록을 두 세계의 자취로 잇는다.
 *
 * 바탕: 클라이언트 · 칸 축의 끝(init 이 싣는다) · 서버가 한 칸에 받는 수
 * 자취: 세계마다 클라이언트의 자리(기다리며 돌아올 칸 / 받힌 칸) · 실패 자국 · 되돌아간 길 · 칸마다 찾아온 수
 * 이번 걸음: 찾아온 칸과, 그 칸에서 받힌 · 되돌아간 클라이언트
 *
 * 셈(서버가 누구를 받아 주는가 · 뽑기 · 기다림)은 알고리즘이 한다. 장면은 이벤트가 앞 장면과 맞는지만 보고 잇는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readJitteredBackoffData, WORLD_IDS, type WorldId } from './algorithm.js';

export interface ClientSpot {
  id: string;
  /** waiting — at 칸에 (다시) 올 참이다 · served — at 칸에서 서버가 받아 줬다 */
  status: 'waiting' | 'served';
  at: number;
}

export interface Hop {
  id: string;
  from: number;
  to: number;
}

export interface WorldTrail {
  clients: ClientSpot[];
  /** 부딪혀 실패한 자국 */
  fails: Array<{ id: string; cell: number }>;
  /** 실패한 칸에서 다시 올 칸으로 되돌아간 길 */
  hops: Hop[];
  /** 칸마다 찾아온 수 (찾아온 칸만) */
  visits: Array<{ cell: number; count: number }>;
  /** 모두 받힌 칸. 아직이면 null */
  finishedAt: number | null;
}

export interface VisitStep {
  kind: 'visit';
  cell: number;
  /** 앞 걸음의 칸. 첫 칸이면 null */
  fromCell: number | null;
  worlds: Record<WorldId, { arrived: string[]; served: string[]; hops: Hop[] }>;
}

export interface JitteredBackoffScene {
  base: {
    clients: string[];
    firstCell: number;
    capacity: number;
    /** 칸 축의 끝 — 알고리즘이 init 으로 싣는다 */
    lastCell: number | null;
  };
  worlds: Record<WorldId, WorldTrail>;
  /** 지금 칸. 아직 한 칸도 찾아오지 않았으면 null */
  cursor: number | null;
  step: VisitStep | null;
}

function obj(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`jitteredBackoffScene: ${path} 가 객체가 아니다`);
  return value as Record<string, unknown>;
}

function int(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`jitteredBackoffScene: ${path} 가 정수가 아니다`);
  return value;
}

function ids(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`jitteredBackoffScene: ${path} 가 배열이 아니다`);
  return value.map((v, i) => {
    if (typeof v !== 'string') throw new Error(`jitteredBackoffScene: ${path}[${i}] 가 식별자가 아니다`);
    return v;
  });
}

function applyWorld(
  trail: WorldTrail,
  raw: unknown,
  cell: number,
  capacity: number,
  path: string,
): { trail: WorldTrail; arrived: string[]; served: string[]; hops: Hop[] } {
  const v = obj(raw, path);
  const arrived = ids(v.arrived, `${path}.arrived`);
  const served = ids(v.served, `${path}.served`);
  if (!Array.isArray(v.failed)) throw new Error(`jitteredBackoffScene: ${path}.failed 가 배열이 아니다`);
  if (typeof v.done !== 'boolean') throw new Error(`jitteredBackoffScene: ${path}.done 이 참거짓이 아니다`);

  const waitingHere = trail.clients.filter((c) => c.status === 'waiting' && c.at === cell).map((c) => c.id);
  if (waitingHere.join(' ') !== arrived.join(' ')) {
    throw new Error(`jitteredBackoffScene: ${path}.arrived (${arrived.join(' ')}) 가 칸 ${cell} 에 올 참인 클라이언트 (${waitingHere.join(' ')}) 와 다르다`);
  }
  if (served.length > capacity) throw new Error(`jitteredBackoffScene: ${path}.served 가 한 칸에 받는 수 ${capacity} 를 넘는다`);
  if (served.join(' ') !== arrived.slice(0, served.length).join(' ')) {
    throw new Error(`jitteredBackoffScene: ${path}.served 가 찾아온 차례의 앞이 아니다`);
  }

  const hops: Hop[] = v.failed.map((f, i) => {
    const one = obj(f, `${path}.failed[${i}]`);
    if (typeof one.id !== 'string') throw new Error(`jitteredBackoffScene: ${path}.failed[${i}].id 가 식별자가 아니다`);
    const next = int(one.next, `${path}.failed[${i}].next`);
    const wait = int(one.wait, `${path}.failed[${i}].wait`);
    if (wait < 1 || next !== cell + wait) throw new Error(`jitteredBackoffScene: ${path}.failed[${i}] 의 next 가 칸 + 기다림이 아니다`);
    return { id: one.id, from: cell, to: next };
  });
  const failedIds = hops.map((h) => h.id);
  if ([...served, ...failedIds].join(' ') !== arrived.join(' ')) {
    throw new Error(`jitteredBackoffScene: ${path} 의 받음과 실패를 합친 것이 찾아온 클라이언트와 다르다`);
  }

  const clients = trail.clients.map((c): ClientSpot => {
    if (served.includes(c.id)) return { id: c.id, status: 'served', at: cell };
    const hop = hops.find((h) => h.id === c.id);
    if (hop) return { id: c.id, status: 'waiting', at: hop.to };
    return { ...c };
  });
  const allServed = clients.every((c) => c.status === 'served');
  if (allServed !== v.done) throw new Error(`jitteredBackoffScene: ${path}.done 이 클라이언트의 자리와 맞지 않다`);

  return {
    trail: {
      clients,
      fails: [...trail.fails.map((f) => ({ ...f })), ...failedIds.map((id) => ({ id, cell }))],
      hops: [...trail.hops.map((h) => ({ ...h })), ...hops.map((h) => ({ ...h }))],
      visits:
        arrived.length > 0
          ? [...trail.visits.map((x) => ({ ...x })), { cell, count: arrived.length }]
          : trail.visits.map((x) => ({ ...x })),
      finishedAt: trail.finishedAt ?? (allServed && arrived.length > 0 ? cell : null),
    },
    arrived,
    served,
    hops,
  };
}

function copyTrail(trail: WorldTrail): WorldTrail {
  return {
    clients: trail.clients.map((c) => ({ ...c })),
    fails: trail.fails.map((f) => ({ ...f })),
    hops: trail.hops.map((h) => ({ ...h })),
    visits: trail.visits.map((x) => ({ ...x })),
    finishedAt: trail.finishedAt,
  };
}

export const jitteredBackoffScene: ScenePlan<JitteredBackoffScene> = {
  initial(initialData: unknown): JitteredBackoffScene {
    const data = readJitteredBackoffData(initialData);
    const fresh = (): WorldTrail => ({
      clients: data.clients.map((id) => ({ id, status: 'waiting', at: data.firstCell })),
      fails: [],
      hops: [],
      visits: [],
      finishedAt: null,
    });
    return {
      base: { clients: [...data.clients], firstCell: data.firstCell, capacity: data.capacity, lastCell: null },
      worlds: { plain: fresh(), jitter: fresh() },
      cursor: null,
      step: null,
    };
  },

  reduce(scene: JitteredBackoffScene, event: FacetRuntimeEvent): JitteredBackoffScene {
    switch (event.type) {
      case 'init': {
        const p = obj(event.payload, 'init.payload');
        const lastCell = int(p.lastCell, 'init.payload.lastCell');
        if (lastCell < scene.base.firstCell) throw new Error('jitteredBackoffScene: init.payload.lastCell 이 첫 칸보다 앞이다');
        return {
          base: { ...scene.base, clients: [...scene.base.clients], lastCell },
          worlds: { plain: copyTrail(scene.worlds.plain), jitter: copyTrail(scene.worlds.jitter) },
          cursor: scene.cursor,
          step: null,
        };
      }
      case 'visit': {
        const { lastCell } = scene.base;
        if (lastCell === null) throw new Error('jitteredBackoffScene: init 앞에 visit 이 왔다');
        const p = obj(event.payload, 'visit.payload');
        const cell = int(p.cell, 'visit.payload.cell');
        if (scene.cursor !== null && cell <= scene.cursor) throw new Error(`jitteredBackoffScene: visit.payload.cell ${cell} 이 지금 칸 ${scene.cursor} 뒤가 아니다`);
        if (cell > lastCell) throw new Error(`jitteredBackoffScene: visit.payload.cell ${cell} 이 칸 축의 끝 ${lastCell} 을 넘는다`);
        const worlds = {} as Record<WorldId, WorldTrail>;
        const stepWorlds = {} as VisitStep['worlds'];
        for (const w of WORLD_IDS) {
          const r = applyWorld(scene.worlds[w], p[w], cell, scene.base.capacity, `visit.payload.${w}`);
          for (const h of r.hops) {
            if (h.to > lastCell) throw new Error(`jitteredBackoffScene: ${h.id} 의 다음 칸 ${h.to} 이 칸 축의 끝을 넘는다`);
          }
          worlds[w] = r.trail;
          stepWorlds[w] = { arrived: r.arrived, served: r.served, hops: r.hops };
        }
        if (stepWorlds.plain.arrived.length === 0 && stepWorlds.jitter.arrived.length === 0) {
          throw new Error(`jitteredBackoffScene: 칸 ${cell} 에 찾아온 클라이언트가 없다`);
        }
        return {
          base: { ...scene.base, clients: [...scene.base.clients] },
          worlds,
          cursor: cell,
          step: { kind: 'visit', cell, fromCell: scene.cursor, worlds: stepWorlds },
        };
      }
      default:
        throw new Error(`jitteredBackoffScene: 모르는 이벤트 ${event.type}`);
    }
  },
};

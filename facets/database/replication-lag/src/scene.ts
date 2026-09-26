import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 바탕 — 노드와 처음 값은 initialData 에서, 새 값이 닿는 시각과 축의 끝은 init 이 준다. */
export type LagNode = { id: string; role: 'leader' | 'follower'; initial: number };

export type LagRead = {
  at: number;
  node: string;
  value: number;
  leaderValue: number;
  stale: boolean;
  caughtUp: number;
  total: number;
};

export type LagStep =
  | { kind: 'write'; from: number; at: number; node: string; value: number; caughtUp: number; total: number }
  | { kind: 'apply'; from: number; at: number; node: string; value: number; lag: number }
  | { kind: 'read'; from: number; at: number; read: LagRead };

export type ReplicationLagScene = {
  key: string;
  leader: string;
  nodes: LagNode[];
  /** init 전에는 null */
  newValue: number | null;
  writeAt: number | null;
  arrivals: { node: string; at: number }[];
  endMs: number | null;
  /** 자취 */
  now: number;
  written: boolean;
  /** 노드가 새 값을 적은 시각 (리더의 쓰기 포함), 일어난 차례 */
  changes: { node: string; at: number; value: number }[];
  reads: LagRead[];
  /** 이번 걸음 */
  step: LagStep | null;
};

function fail(msg: string): never {
  throw new Error(`replication-lag scene: ${msg}`);
}

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${k} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v === '') fail(`${k} 가 글자가 아니다`);
  return v;
}

function bool(o: Record<string, unknown>, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') fail(`${k} 가 참거짓이 아니다`);
  return v;
}

function list(o: Record<string, unknown>, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) fail(`${k} 가 배열이 아니다`);
  return v;
}

function knownNode(scene: ReplicationLagScene, id: string): string {
  if (!scene.nodes.some((n) => n.id === id)) fail(`노드 ${id} 를 모른다`);
  return id;
}

export const replicationLagScene: ScenePlan<ReplicationLagScene> = {
  initial(initialData: unknown): ReplicationLagScene {
    const d = rec(initialData, 'initialData');
    const leader = str(d, 'leader');
    const nodes: LagNode[] = list(d, 'nodes').map((raw, i) => {
      const n = rec(raw, `nodes[${i}]`);
      const id = str(n, 'id');
      return { id, role: id === leader ? 'leader' : 'follower', initial: num(n, 'value') };
    });
    if (!nodes.some((n) => n.role === 'leader')) fail(`리더 ${leader} 가 노드에 없다`);
    return {
      key: str(d, 'key'),
      leader,
      nodes,
      newValue: null,
      writeAt: null,
      arrivals: [],
      endMs: null,
      now: 0,
      written: false,
      changes: [],
      reads: [],
      step: null,
    };
  },

  reduce(scene: ReplicationLagScene, event: FacetRuntimeEvent): ReplicationLagScene {
    const p = rec(event.payload, `${event.type} payload`);
    switch (event.type) {
      case 'init': {
        const arrivals = list(p, 'arrivals').map((raw, i) => {
          const a = rec(raw, `arrivals[${i}]`);
          return { node: knownNode(scene, str(a, 'node')), at: num(a, 'at') };
        });
        return {
          ...scene,
          key: str(p, 'key'),
          newValue: num(p, 'newValue'),
          writeAt: num(p, 'writeAt'),
          arrivals,
          endMs: num(p, 'endMs'),
          step: null,
        };
      }
      case 'write': {
        const at = num(p, 'at');
        const node = knownNode(scene, str(p, 'node'));
        const value = num(p, 'value');
        return {
          ...scene,
          now: at,
          written: true,
          changes: [...scene.changes, { node, at, value }],
          step: { kind: 'write', from: scene.now, at, node, value, caughtUp: num(p, 'caughtUp'), total: num(p, 'total') },
        };
      }
      case 'apply': {
        const at = num(p, 'at');
        const node = knownNode(scene, str(p, 'node'));
        const value = num(p, 'value');
        return {
          ...scene,
          now: at,
          changes: [...scene.changes, { node, at, value }],
          step: { kind: 'apply', from: scene.now, at, node, value, lag: num(p, 'lag') },
        };
      }
      case 'read': {
        const read: LagRead = {
          at: num(p, 'at'),
          node: knownNode(scene, str(p, 'node')),
          value: num(p, 'value'),
          leaderValue: num(p, 'leaderValue'),
          stale: bool(p, 'stale'),
          caughtUp: num(p, 'caughtUp'),
          total: num(p, 'total'),
        };
        return {
          ...scene,
          now: read.at,
          reads: [...scene.reads, read],
          step: { kind: 'read', from: scene.now, at: read.at, read },
        };
      }
      default:
        return fail(`모르는 이벤트 ${event.type}`);
    }
  },
};

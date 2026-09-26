/**
 * copy-to-followers 장면.
 *
 * 바탕   nodes 의 식별자 · 역할 차례, capacity (쓰기 수 — 칸 높이를 한 번 정한다)
 * 자취   노드마다 적힌 값 (적힌 차례대로), 멈춘 노드
 * 이번   step — 방금 일어난 사건 하나
 *
 * 셈(사본 수 · 살아 있는 사본 수 · 응답해도 되는가)은 알고리즘이 하고 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type CopyEntry = { key: string; value: number };

export type CopyNode = {
  id: string;
  leader: boolean;
  entries: CopyEntry[];
  down: boolean;
};

export type CopyStep =
  | { kind: 'write'; node: string; key: string; value: number; copies: number }
  | { kind: 'replicate'; from: string; to: string[]; key: string; value: number; copies: number }
  | { kind: 'ack'; node: string; key: string; value: number; copies: number }
  | { kind: 'stop'; node: string }
  | { kind: 'read'; node: string; key: string; value: number; live: number };

export type CopyToFollowersScene = {
  nodes: CopyNode[];
  capacity: number;
  step: CopyStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(p: Record<string, unknown>, name: string, type: string): string {
  const v = p[name];
  if (typeof v !== 'string') throw new Error(`copy-to-followers: ${type}.${name} 가 문자열이 아니다`);
  return v;
}

function num(p: Record<string, unknown>, name: string, type: string): number {
  const v = p[name];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`copy-to-followers: ${type}.${name} 가 수가 아니다`);
  }
  return v;
}

function strList(p: Record<string, unknown>, name: string, type: string): string[] {
  const v = p[name];
  if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) {
    throw new Error(`copy-to-followers: ${type}.${name} 가 문자열 목록이 아니다`);
  }
  return [...v];
}

/** 노드 하나에 값을 적은 새 장면 조각. 같은 열쇠가 있으면 그 자리를 갈고, 없으면 뒤에 붙인다. */
function put(node: CopyNode, key: string, value: number): CopyNode {
  const at = node.entries.findIndex((e) => e.key === key);
  const entries =
    at < 0
      ? [...node.entries, { key, value }]
      : node.entries.map((e, i) => (i === at ? { key, value } : { ...e }));
  return { ...node, entries };
}

function cloneNodes(nodes: CopyNode[]): CopyNode[] {
  return nodes.map((n) => ({ ...n, entries: n.entries.map((e) => ({ ...e })) }));
}

function requireNode(nodes: CopyNode[], id: string): void {
  if (!nodes.some((n) => n.id === id)) throw new Error(`copy-to-followers: 모르는 노드 '${id}'`);
}

export const copyToFollowersScene: ScenePlan<CopyToFollowersScene> = {
  initial(initialData: unknown): CopyToFollowersScene {
    if (!isRecord(initialData)) throw new Error('copy-to-followers: initialData 가 없다');
    const ids = strList(initialData, 'nodes', 'initialData');
    const leader = str(initialData, 'leader', 'initialData');
    if (!ids.includes(leader)) throw new Error(`copy-to-followers: 리더 '${leader}' 가 nodes 에 없다`);
    const writes = initialData['writes'];
    if (!Array.isArray(writes)) throw new Error('copy-to-followers: initialData.writes 가 목록이 아니다');
    return {
      nodes: ids.map((id) => ({ id, leader: id === leader, entries: [], down: false })),
      capacity: writes.length,
      step: null,
    };
  },

  reduce(scene: CopyToFollowersScene, event: FacetRuntimeEvent): CopyToFollowersScene {
    const p = event.payload;
    if (!isRecord(p)) throw new Error(`copy-to-followers: ${event.type} 에 payload 가 없다`);
    const type = event.type;

    if (type === 'write') {
      const node = str(p, 'node', type);
      const key = str(p, 'key', type);
      const value = num(p, 'value', type);
      requireNode(scene.nodes, node);
      return {
        ...scene,
        nodes: scene.nodes.map((n) => (n.id === node ? put(n, key, value) : { ...n, entries: n.entries.map((e) => ({ ...e })) })),
        step: { kind: 'write', node, key, value, copies: num(p, 'copies', type) },
      };
    }
    if (type === 'replicate') {
      const from = str(p, 'from', type);
      const to = strList(p, 'to', type);
      const key = str(p, 'key', type);
      const value = num(p, 'value', type);
      requireNode(scene.nodes, from);
      for (const id of to) requireNode(scene.nodes, id);
      return {
        ...scene,
        nodes: scene.nodes.map((n) => (to.includes(n.id) ? put(n, key, value) : { ...n, entries: n.entries.map((e) => ({ ...e })) })),
        step: { kind: 'replicate', from, to, key, value, copies: num(p, 'copies', type) },
      };
    }
    if (type === 'ack') {
      const node = str(p, 'node', type);
      requireNode(scene.nodes, node);
      return {
        ...scene,
        nodes: cloneNodes(scene.nodes),
        step: {
          kind: 'ack',
          node,
          key: str(p, 'key', type),
          value: num(p, 'value', type),
          copies: num(p, 'copies', type),
        },
      };
    }
    if (type === 'stop') {
      const node = str(p, 'node', type);
      requireNode(scene.nodes, node);
      return {
        ...scene,
        nodes: cloneNodes(scene.nodes).map((n) => (n.id === node ? { ...n, down: true } : n)),
        step: { kind: 'stop', node },
      };
    }
    if (type === 'read') {
      const node = str(p, 'node', type);
      requireNode(scene.nodes, node);
      return {
        ...scene,
        nodes: cloneNodes(scene.nodes),
        step: {
          kind: 'read',
          node,
          key: str(p, 'key', type),
          value: num(p, 'value', type),
          live: num(p, 'live', type),
        },
      };
    }
    throw new Error(`copy-to-followers: 모르는 이벤트 '${type}'`);
  },
};

/**
 * partition-forces-choice 의 장면.
 *
 * 바탕  — 노드 차례와 무리(자리를 가르는 데만 쓴다), 모든 쌍의 이음, 열쇠
 * 자취  — 노드 값, 끊긴 이음, 쓰기 · 읽기, 두 갈래의 결말
 * 이번 걸음 — step (값이 바뀐 걸음은 바뀌기 전 값을 싣는다)
 *
 * 셈(누가 끊겼나 · 누구에게 퍼지나 · 거절인가)은 알고리즘이 했다. 장면은 이벤트를 잇기만 한다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PfcNode = { id: string; value: number };

export type PfcStep =
  | { kind: 'start' }
  | { kind: 'cut' }
  | { kind: 'write'; was: Record<string, number> }
  | { kind: 'read' }
  | { kind: 'refuse' }
  | { kind: 'answer' };

export type PartitionForcesChoiceScene = {
  key: string;
  nodes: PfcNode[];
  /** 자리를 가르는 무리 둘 (initialData.partition 을 베낀 것) */
  sides: [string[], string[]];
  links: [string, string][];
  severed: [string, string][];
  write: { node: string; value: number; reached: string[]; blocked: string[] } | null;
  read: { node: string; asked: string[]; reachable: string[] } | null;
  refused: { node: string } | null;
  answered: { node: string; value: number; latest: number } | null;
  step: PfcStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`partition-forces-choice: ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`partition-forces-choice: ${what} 에 글자가 아닌 것`);
    return x;
  });
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`partition-forces-choice: ${what} 가 없다`);
  return v;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`partition-forces-choice: ${what} 가 수가 아니다`);
  return v;
}

function pairList(v: unknown, what: string): [string, string][] {
  if (!Array.isArray(v)) throw new Error(`partition-forces-choice: ${what} 가 배열이 아니다`);
  return v.map((p) => {
    const l = strList(p, what);
    const a = l[0];
    const b = l[1];
    if (l.length !== 2 || a === undefined || b === undefined) {
      throw new Error(`partition-forces-choice: ${what} 의 쌍이 둘이 아니다`);
    }
    return [a, b];
  });
}

export const partitionForcesChoiceScene: ScenePlan<PartitionForcesChoiceScene> = {
  initial(initialData) {
    if (!isRecord(initialData)) throw new Error('partition-forces-choice: initialData 가 없다');
    const rawNodes = initialData['nodes'];
    if (!Array.isArray(rawNodes)) throw new Error('partition-forces-choice: nodes 가 없다');
    const nodes: PfcNode[] = rawNodes.map((n, i) => {
      if (!isRecord(n)) throw new Error(`partition-forces-choice: nodes[${i}] 모양이 틀렸다`);
      return { id: str(n['id'], `nodes[${i}].id`), value: num(n['value'], `nodes[${i}].value`) };
    });
    const part = initialData['partition'];
    if (!Array.isArray(part) || part.length !== 2) throw new Error('partition-forces-choice: partition 은 무리 둘이다');
    const sides: [string[], string[]] = [strList(part[0], 'partition[0]'), strList(part[1], 'partition[1]')];
    // 모든 노드가 무리 둘 중 정확히 하나에 속한다
    const ids = nodes.map((n) => n.id);
    for (const id of ids) {
      const count = (sides[0].includes(id) ? 1 : 0) + (sides[1].includes(id) ? 1 : 0);
      if (count !== 1) throw new Error(`partition-forces-choice: 노드 ${id} 가 속한 무리 수가 하나가 아니다`);
    }
    for (const id of [...sides[0], ...sides[1]]) {
      if (!ids.includes(id)) throw new Error(`partition-forces-choice: partition 의 모르는 노드 ${id}`);
    }
    const links: [string, string][] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (a === undefined || b === undefined) throw new Error('partition-forces-choice: 노드 차례가 비었다');
        links.push([a.id, b.id]);
      }
    }
    return {
      key: str(initialData['key'], 'key'),
      nodes,
      sides,
      links,
      severed: [],
      write: null,
      read: null,
      refused: null,
      answered: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene, event: FacetRuntimeEvent) {
    const p = event.payload;
    switch (event.type) {
      case 'cut': {
        if (!isRecord(p)) throw new Error('partition-forces-choice: cut payload 가 없다');
        return { ...scene, severed: pairList(p['severed'], 'severed'), step: { kind: 'cut' } };
      }
      case 'write': {
        if (!isRecord(p)) throw new Error('partition-forces-choice: write payload 가 없다');
        const node = str(p['node'], 'write.node');
        const value = num(p['value'], 'write.value');
        const reached = strList(p['reached'], 'write.reached');
        const blocked = strList(p['blocked'], 'write.blocked');
        const was: Record<string, number> = {};
        for (const n of scene.nodes) was[n.id] = n.value;
        const nodes = scene.nodes.map((n) => (reached.includes(n.id) ? { id: n.id, value } : { ...n }));
        return { ...scene, nodes, write: { node, value, reached, blocked }, step: { kind: 'write', was } };
      }
      case 'read': {
        if (!isRecord(p)) throw new Error('partition-forces-choice: read payload 가 없다');
        return {
          ...scene,
          read: {
            node: str(p['node'], 'read.node'),
            asked: strList(p['asked'], 'read.asked'),
            reachable: strList(p['reachable'], 'read.reachable'),
          },
          step: { kind: 'read' },
        };
      }
      case 'refuse': {
        if (!isRecord(p)) throw new Error('partition-forces-choice: refuse payload 가 없다');
        return { ...scene, refused: { node: str(p['node'], 'refuse.node') }, step: { kind: 'refuse' } };
      }
      case 'answer': {
        if (!isRecord(p)) throw new Error('partition-forces-choice: answer payload 가 없다');
        return {
          ...scene,
          answered: {
            node: str(p['node'], 'answer.node'),
            value: num(p['value'], 'answer.value'),
            latest: num(p['latest'], 'answer.latest'),
          },
          step: { kind: 'answer' },
        };
      }
      default:
        throw new Error(`partition-forces-choice: 모르는 이벤트 ${event.type}`);
    }
  },
};

/**
 * traverse-relationships 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 한다.
 *
 *  바탕  nodes · edges · start · path — initialData 에서 베낀다 (걸음 0 이 이것으로 선다)
 *  자취  seen · crossed · reached · expanded · totals · answer · untouched
 *  이번  step — 이번 걸음에 펼친 노드와 그 이음, 또는 답
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { GraphEdge, GraphNode } from './algorithm.js';

export type TraverseStep =
  | {
      kind: 'expand';
      hop: number;
      node: string;
      type: string;
      seen: number[];
      crossed: number[];
      reached: string[];
    }
  | { kind: 'answer' };

export type TraverseRelationshipsScene = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  start: string;
  path: string[];
  /** 지금까지 들여다본 이음 번호 */
  seen: number[];
  /** 지금까지 건넌 이음 번호 */
  crossed: number[];
  /** 닿은 노드 (닿은 차례, 출발 포함) */
  reached: string[];
  /** 펼친 노드 (펼친 차례) */
  expanded: string[];
  /** 알고리즘이 센 누적값 */
  totals: { seen: number; crossed: number; reached: number };
  /** 끝났을 때만 */
  answer: string[] | null;
  untouched: string[] | null;
  step: TraverseStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringList(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`traverse-relationships: ${what} 가 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`traverse-relationships: ${what}[${i}] 가 글자가 아니다`);
    return x;
  });
}

function numberList(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`traverse-relationships: ${what} 가 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number') throw new Error(`traverse-relationships: ${what}[${i}] 가 수가 아니다`);
    return x;
  });
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`traverse-relationships: ${what} 가 글자가 아니다`);
  return v;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number') throw new Error(`traverse-relationships: ${what} 가 수가 아니다`);
  return v;
}

/** 바탕을 initialData 에서 베껴 걸음 0 을 세운다. */
function initial(initialData: unknown): TraverseRelationshipsScene {
  if (!isRecord(initialData)) throw new Error('traverse-relationships: initialData 가 없다');
  const rawNodes = initialData['nodes'];
  const rawEdges = initialData['edges'];
  if (!Array.isArray(rawNodes)) throw new Error('traverse-relationships: nodes 가 없다');
  if (!Array.isArray(rawEdges)) throw new Error('traverse-relationships: edges 가 없다');
  const nodes: GraphNode[] = rawNodes.map((n: unknown, i) => {
    if (!isRecord(n)) throw new Error(`traverse-relationships: nodes[${i}] 모양이 틀렸다`);
    return { id: str(n['id'], `nodes[${i}].id`), kind: str(n['kind'], `nodes[${i}].kind`) };
  });
  const edges: GraphEdge[] = rawEdges.map((e: unknown, i) => {
    if (!isRecord(e)) throw new Error(`traverse-relationships: edges[${i}] 모양이 틀렸다`);
    return {
      from: str(e['from'], `edges[${i}].from`),
      type: str(e['type'], `edges[${i}].type`),
      to: str(e['to'], `edges[${i}].to`),
    };
  });
  const start = str(initialData['start'], 'start');
  const path = stringList(initialData['path'], 'path');
  return {
    nodes,
    edges,
    start,
    path,
    seen: [],
    crossed: [],
    reached: [start],
    expanded: [],
    totals: { seen: 0, crossed: 0, reached: 1 },
    answer: null,
    untouched: null,
    step: null,
  };
}

function reduce(scene: TraverseRelationshipsScene, event: FacetRuntimeEvent): TraverseRelationshipsScene {
  const p = event.payload;
  switch (event.type) {
    case 'expand': {
      if (!isRecord(p)) throw new Error('traverse-relationships: expand payload 가 없다');
      const node = str(p['node'], 'expand.node');
      const seen = numberList(p['seen'], 'expand.seen');
      const crossed = numberList(p['crossed'], 'expand.crossed');
      const reached = stringList(p['reached'], 'expand.reached');
      return {
        ...scene,
        seen: [...scene.seen, ...seen],
        crossed: [...scene.crossed, ...crossed],
        reached: [...scene.reached, ...reached],
        expanded: [...scene.expanded, node],
        totals: {
          seen: num(p['seenTotal'], 'expand.seenTotal'),
          crossed: num(p['crossedTotal'], 'expand.crossedTotal'),
          reached: num(p['reachedTotal'], 'expand.reachedTotal'),
        },
        step: {
          kind: 'expand',
          hop: num(p['hop'], 'expand.hop'),
          node,
          type: str(p['type'], 'expand.type'),
          seen,
          crossed,
          reached,
        },
      };
    }
    case 'answer': {
      if (!isRecord(p)) throw new Error('traverse-relationships: answer payload 가 없다');
      return {
        ...scene,
        answer: stringList(p['nodes'], 'answer.nodes'),
        untouched: stringList(p['untouched'], 'answer.untouched'),
        step: { kind: 'answer' },
      };
    }
    default:
      throw new Error(`traverse-relationships: 모르는 이벤트 ${event.type}`);
  }
}

export const traverseRelationshipsScene: ScenePlan<TraverseRelationshipsScene> = { initial, reduce };

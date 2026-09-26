/**
 * plan-is-a-tree 장면 — 이벤트를 잇기만 한다. 끌어올리기 셈은 알고리즘이 한다.
 *
 *   바탕  sql · 판판한 계획 노드 · 잎 차례의 표 (initial 이 initialData 에서 세운다 — 걸음 0)
 *   자취  읽힌 줄 · 해시표에 고인 줄 · 멈춘 줄 · 답 줄 (걸음이 쌓는다, 차례 그대로)
 *   이번  step — 이번 걸음의 여정 하나
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { flattenPlan, readPlanData, type Cell, type FlatNode, type JourneyEnd } from './algorithm.js';

export type { Cell, FlatNode, JourneyEnd } from './algorithm.js';

export type SceneTable = { name: string; alias: string; cols: string[]; rows: Cell[][] };

export type RowRef = { table: string; row: number };

export type SceneJourney = {
  table: string;
  row: number;
  path: string[];
  end: JourneyEnd;
  match: RowRef | null;
  out: Cell[] | null;
};

export type PlanIsATreeScene = {
  base: {
    sql: string[];
    nodes: FlatNode[];
    /** 잎 차례 (계획을 왼쪽부터 훑은 차례) */
    tables: SceneTable[];
  };
  read: RowRef[];
  /** 해시표에 고인 줄 — join 은 그 Hash Join 노드 id */
  stored: (RowRef & { join: string })[];
  /** 멈춘 줄 — node 는 멈춘 자리 */
  stopped: (RowRef & { node: string })[];
  answers: { table: string; row: number; match: RowRef | null; out: Cell[] }[];
  step: SceneJourney | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readRowRef(v: unknown): RowRef | null {
  if (v === null) return null;
  if (!isRecord(v) || typeof v['table'] !== 'string' || typeof v['row'] !== 'number') {
    throw new Error('plan-is-a-tree 장면: match 가 { table, row } 모양이 아니다');
  }
  return { table: v['table'], row: v['row'] };
}

function readJourney(payload: unknown): SceneJourney {
  if (!isRecord(payload)) throw new Error('plan-is-a-tree 장면: journey 에 payload 가 없다');
  const table = payload['table'];
  const row = payload['row'];
  const path = payload['path'];
  const end = payload['end'];
  const out = payload['out'];
  if (typeof table !== 'string' || typeof row !== 'number') {
    throw new Error('plan-is-a-tree 장면: journey 의 table · row 가 없다');
  }
  if (!Array.isArray(path) || path.length === 0 || !path.every((p) => typeof p === 'string')) {
    throw new Error('plan-is-a-tree 장면: journey 의 path 가 비었다');
  }
  if (end !== 'stored' && end !== 'stopped' && end !== 'answer') {
    throw new Error(`plan-is-a-tree 장면: 모르는 끝 ${String(end)}`);
  }
  let cells: Cell[] | null = null;
  if (out !== null) {
    if (!Array.isArray(out) || !out.every((c) => typeof c === 'string' || typeof c === 'number')) {
      throw new Error('plan-is-a-tree 장면: journey 의 out 이 칸 배열이 아니다');
    }
    cells = [...(out as Cell[])];
  }
  if (end === 'answer' && cells === null) throw new Error('plan-is-a-tree 장면: 답인데 out 이 없다');
  return { table, row, path: [...path], end, match: readRowRef(payload['match'] ?? null), out: cells };
}

export const planIsATreeScene: ScenePlan<PlanIsATreeScene> = {
  initial(initialData: unknown): PlanIsATreeScene {
    const data = readPlanData(initialData);
    const nodes = flattenPlan(data.plan);
    const tables: SceneTable[] = [];
    for (const n of nodes) {
      if (n.node.op !== 'Seq Scan') continue;
      const t = data.tables[n.node.table];
      if (!t) throw new Error(`plan-is-a-tree 장면: 표 ${n.node.table} 가 자료에 없다`);
      tables.push({ name: n.node.table, alias: n.node.alias, cols: [...t.cols], rows: t.rows.map((r) => [...r]) });
    }
    return {
      base: { sql: [...data.sql], nodes, tables },
      read: [],
      stored: [],
      stopped: [],
      answers: [],
      step: null,
    };
  },

  reduce(scene: PlanIsATreeScene, event: FacetRuntimeEvent): PlanIsATreeScene {
    if (event.type !== 'journey') return scene;
    const j = readJourney(event.payload);
    const last = j.path[j.path.length - 1]!;
    const src = { table: j.table, row: j.row };
    const already = scene.read.some((r) => r.table === j.table && r.row === j.row);
    return {
      base: scene.base,
      read: already ? scene.read : [...scene.read, src],
      stored: j.end === 'stored' ? [...scene.stored, { ...src, join: last }] : scene.stored,
      stopped: j.end === 'stopped' ? [...scene.stopped, { ...src, node: last }] : scene.stopped,
      answers:
        j.end === 'answer' && j.out
          ? [...scene.answers, { ...src, match: j.match, out: j.out }]
          : scene.answers,
      step: j,
    };
  },
};

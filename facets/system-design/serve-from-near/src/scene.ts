import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readServeFromNearData } from './algorithm.js';

/** 바탕 — initialData 에서 베낀 구조 */
export type ServeFromNearBase = {
  edges: string[];
  origin: string;
  users: string[];
  rtt: Record<string, Record<string, number>>;
};

/** 셈으로 나오는 바탕과 누계 — silent init 이 채우고 걸음마다 갈린다 */
export type ServeFromNearTally = {
  span: number;
  edgeTotal: number;
  originTotal: number;
  originRequests: number;
  served: { edge: string; n: number }[];
};

/** 자취 — 내어 준 요청 하나 */
export type ServedRequest = { user: string; edge: string; ms: number; originMs: number };

export type ServeFromNearStep = {
  kind: 'serve';
  user: string;
  edge: string;
  ms: number;
  originMs: number;
  saved: number;
};

export type ServeFromNearScene = {
  base: ServeFromNearBase;
  tally: ServeFromNearTally | null;
  trail: ServedRequest[];
  step: ServeFromNearStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`serveFromNearScene: ${path} — ${why}`);
}

function field(p: Record<string, unknown>, name: string, type: 'string'): string;
function field(p: Record<string, unknown>, name: string, type: 'number'): number;
function field(p: Record<string, unknown>, name: string, type: 'string' | 'number'): string | number {
  const v = p[name];
  if (typeof v !== type) fail(`payload.${name}`, `${type} 가 아니다`);
  return v as string | number;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function reduceInit(scene: ServeFromNearScene, p: Record<string, unknown>): ServeFromNearScene {
  if (scene.tally !== null) fail('init', '두 번 왔다');
  const raw = p.served;
  if (!Array.isArray(raw) || raw.length !== scene.base.edges.length) {
    fail('init.payload.served', '엣지 수와 맞지 않는다');
  }
  const served = raw.map((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null) fail(`init.payload.served[${i}]`, '객체가 아니다');
    const r = item as Record<string, unknown>;
    const edge = field(r, 'edge', 'string');
    const n = field(r, 'n', 'number');
    if (edge !== scene.base.edges[i]) fail(`init.payload.served[${i}].edge`, `바탕의 차례와 다르다: ${edge}`);
    return { edge, n };
  });
  const span = field(p, 'span', 'number');
  if (!(span > 0)) fail('init.payload.span', '양수여야 한다');
  return {
    ...scene,
    tally: {
      span,
      edgeTotal: field(p, 'edgeTotal', 'number'),
      originTotal: field(p, 'originTotal', 'number'),
      originRequests: field(p, 'originRequests', 'number'),
      served,
    },
    step: null,
  };
}

function reduceServe(scene: ServeFromNearScene, p: Record<string, unknown>): ServeFromNearScene {
  const tally = scene.tally;
  if (tally === null) fail('serve', 'init 보다 먼저 왔다');
  const user = field(p, 'user', 'string');
  const edge = field(p, 'edge', 'string');
  const ms = field(p, 'ms', 'number');
  const originMs = field(p, 'originMs', 'number');
  const saved = field(p, 'saved', 'number');
  const expectedUser = scene.base.users[scene.trail.length];
  if (expectedUser === undefined) fail('serve.payload.user', '남은 사용자가 없다');
  if (user !== expectedUser) fail('serve.payload.user', `차례는 ${expectedUser} 인데 ${user} 가 왔다`);
  const at = tally.served.findIndex((s) => s.edge === edge);
  if (at < 0) fail('serve.payload.edge', `바탕에 없는 엣지 ${edge}`);
  const row = scene.base.rtt[user];
  if (!row) fail(`base.rtt.${user}`, '줄이 없다');
  if (row[edge] !== ms) fail('serve.payload.ms', `바탕의 왕복 ${String(row[edge])} 과 다르다: ${ms}`);
  if (row[scene.base.origin] !== originMs) fail('serve.payload.originMs', `바탕의 왕복과 다르다: ${originMs}`);
  const edgeServed = field(p, 'edgeServed', 'number');
  const before = tally.served[at] as { edge: string; n: number };
  if (edgeServed !== before.n + 1) fail('serve.payload.edgeServed', `앞 장면 ${before.n} 에서 하나 는 값이 아니다`);
  return {
    base: scene.base,
    tally: {
      span: tally.span,
      edgeTotal: field(p, 'edgeTotal', 'number'),
      originTotal: field(p, 'originTotal', 'number'),
      originRequests: field(p, 'originRequests', 'number'),
      served: tally.served.map((s, i) => (i === at ? { edge: s.edge, n: edgeServed } : { ...s })),
    },
    trail: [...scene.trail.map((r) => ({ ...r })), { user, edge, ms, originMs }],
    step: { kind: 'serve', user, edge, ms, originMs, saved },
  };
}

export const serveFromNearScene: ScenePlan<ServeFromNearScene> = {
  initial(initialData: unknown): ServeFromNearScene {
    const d = readServeFromNearData(initialData);
    return {
      base: { edges: d.edges, origin: d.origin, users: d.users, rtt: d.rtt },
      tally: null,
      trail: [],
      step: null,
    };
  },
  reduce(scene: ServeFromNearScene, event: FacetRuntimeEvent): ServeFromNearScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, payloadOf(event));
      case 'serve':
        return reduceServe(scene, payloadOf(event));
      default:
        throw new Error(`serveFromNearScene: 모르는 이벤트 ${event.type}`);
    }
  },
};

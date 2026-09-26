/**
 * diamond-dependency 의 장면.
 *
 * 바탕 — 뿌리 · 이름마다의 층 · 꾸러미마다의 부름 (initialData 의 구조에서 initial() 이 한 번 정한다)
 * 자취 — 놓인 꾸러미(이름 · 고른 버전) · 푼 부름(간선과 그 갈래) · 아직 안 푼 부름
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { callsOf, nameLevels, type DiamondCall, type DiamondDependencyFacetData } from './algorithm.js';

export type DiamondEdge = { from: string; name: string; range: string; kind: 'pick' | 'reuse' };
export type DiamondPending = { from: string; name: string; range: string };

export type DiamondStep =
  | { kind: 'start' }
  | { kind: 'pick' | 'reuse'; from: string; name: string; range: string; version: string }
  | { kind: 'done'; name: string; version: string; callers: number; copies: number; installed: number };

export type DiamondDependencyScene = {
  root: string;
  levels: { name: string; level: number }[];
  calls: Record<string, DiamondCall[]>;
  placed: { name: string; version: string }[];
  edges: DiamondEdge[];
  pending: DiamondPending[];
  step: DiamondStep;
};

/** initialData 를 좁힌다. 아예 없으면 null (빈 장면), 있는데 모양이 틀리면 필드 이름을 담아 던진다. */
function narrow(raw: unknown): DiamondDependencyFacetData | null {
  if (raw === undefined || raw === null) return null;
  const bad = (what: string): never => {
    throw new Error(`diamond-dependency 장면: initialData.${what} 의 모양이 틀렸다`);
  };
  if (typeof raw !== 'object') return bad('(전체)');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'diamond-dependency') return bad('type');
  if (typeof d.stepMs !== 'number') return bad('stepMs');
  if (typeof d.root !== 'string') return bad('root');
  if (!d.calls || typeof d.calls !== 'object') return bad('calls');
  const calls: Record<string, DiamondCall[]> = {};
  for (const [pkg, list] of Object.entries(d.calls as Record<string, unknown>)) {
    if (!Array.isArray(list)) return bad(`calls.${pkg}`);
    calls[pkg] = list.map((item, i) => {
      if (!item || typeof item !== 'object') return bad(`calls.${pkg}[${i}]`);
      const c = item as Record<string, unknown>;
      if (typeof c.name !== 'string') return bad(`calls.${pkg}[${i}].name`);
      if (typeof c.range !== 'string') return bad(`calls.${pkg}[${i}].range`);
      return { name: c.name, range: c.range };
    });
  }
  if (!d.published || typeof d.published !== 'object') return bad('published');
  const published: Record<string, string[]> = {};
  for (const [pkg, list] of Object.entries(d.published as Record<string, unknown>)) {
    if (!Array.isArray(list)) return bad(`published.${pkg}`);
    published[pkg] = list.map((v, i) => (typeof v === 'string' ? v : bad(`published.${pkg}[${i}]`)));
  }
  return { type: 'diamond-dependency', stepMs: d.stepMs, root: d.root, calls, published };
}

function pendingOf(calls: Record<string, DiamondCall[]>, pkg: string): DiamondPending[] {
  return (calls[pkg] ?? []).map((c) => ({ from: pkg, name: c.name, range: c.range }));
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`diamond-dependency 장면: payload.${key} 가 글자가 아니다`);
  return v;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`diamond-dependency 장면: payload.${key} 가 수가 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (!p || typeof p !== 'object') throw new Error(`diamond-dependency 장면: ${event.type} 에 payload 가 없다`);
  return p as Record<string, unknown>;
}

export const diamondDependencyScene: ScenePlan<DiamondDependencyScene> = {
  initial(initialData) {
    const data = narrow(initialData);
    if (!data) {
      return { root: '', levels: [], calls: {}, placed: [], edges: [], pending: [], step: { kind: 'start' } };
    }
    const calls: Record<string, DiamondCall[]> = {};
    for (const pkg of Object.keys(data.calls)) {
      calls[pkg] = callsOf(data, pkg).map((c) => ({ name: c.name, range: c.range }));
    }
    return {
      root: data.root,
      levels: nameLevels(data).map((x) => ({ name: x.name, level: x.level })),
      calls,
      placed: [],
      edges: [],
      pending: pendingOf(calls, data.root),
      step: { kind: 'start' },
    };
  },

  reduce(scene, event) {
    if (event.type === 'pick' || event.type === 'reuse') {
      const p = payloadOf(event);
      const from = str(p, 'from');
      const name = str(p, 'name');
      const range = str(p, 'range');
      const version = str(p, 'version');
      const kind = event.type === 'pick' ? 'pick' : 'reuse';
      const rest = scene.pending.filter((x) => !(x.from === from && x.name === name));
      return {
        ...scene,
        placed: kind === 'pick' ? [...scene.placed, { name, version }] : scene.placed,
        edges: [...scene.edges, { from, name, range, kind }],
        pending: kind === 'pick' ? [...rest, ...pendingOf(scene.calls, name)] : rest,
        step: { kind, from, name, range, version },
      };
    }
    if (event.type === 'done') {
      const p = payloadOf(event);
      return {
        ...scene,
        step: {
          kind: 'done',
          name: str(p, 'name'),
          version: str(p, 'version'),
          callers: num(p, 'callers'),
          copies: num(p, 'copies'),
          installed: num(p, 'installed'),
        },
      };
    }
    throw new Error(`diamond-dependency 장면: 모르는 이벤트 "${event.type}"`);
  },
};

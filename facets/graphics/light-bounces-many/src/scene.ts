/**
 * light-bounces-many 장면.
 *
 * - 바탕: 방 · 면 · 빛 · 눈 (initialData 에서 베낀다) + init 이 정하는 첫 방향 · 출발 합
 * - 자취: 지나온 꼭짓점들 (경로 토막 · 더한 몫)
 * - 이번 걸음: 방금 생긴 꼭짓점 번호 (없으면 null)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowLightBouncesMany,
  type LightBouncesManyFacetData,
  type SurfaceId,
  type Vec2,
  type Vertex,
} from './algorithm.js';

export type LightBouncesManyScene = {
  base: LightBouncesManyFacetData;
  /** init 이 싣는 첫 방향. init 전(걸음 0 을 갈아 끼우기 전)에는 null */
  dir: Vec2 | null;
  /** 출발 합 · 첫 지나온 몫 — init 이 싣는다 */
  start: { total: number; through: number } | null;
  vertices: Vertex[];
  step: { k: number } | null;
};

function bad(path: string, why: string): never {
  throw new Error(`light-bounces-many 장면: ${path} — ${why}`);
}

function field(p: Record<string, unknown>, key: string, path: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${path}.${key}`, '유한한 수가 아니다');
  return v;
}

function pair(p: Record<string, unknown>, key: string, path: string): Vec2 {
  const v = p[key];
  if (!Array.isArray(v) || v.length !== 2) bad(`${path}.${key}`, '수 둘이 아니다');
  const [a, b] = v as unknown[];
  if (typeof a !== 'number' || typeof b !== 'number') bad(`${path}.${key}`, '수 둘이 아니다');
  return [a, b];
}

function same(a: Vec2, b: Vec2): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

export const lightBouncesManyScene: ScenePlan<LightBouncesManyScene> = {
  initial(initialData: unknown): LightBouncesManyScene {
    return {
      base: narrowLightBouncesMany(initialData),
      dir: null,
      start: null,
      vertices: [],
      step: null,
    };
  },

  reduce(scene: LightBouncesManyScene, event: FacetRuntimeEvent): LightBouncesManyScene {
    const raw = event.payload;
    if (typeof raw !== 'object' || raw === null) bad(`${event.type}.payload`, '객체가 아니다');
    const p = raw as Record<string, unknown>;
    switch (event.type) {
      case 'init': {
        if (scene.vertices.length > 0) bad('init', '꼭짓점이 생긴 뒤에 왔다');
        return {
          ...scene,
          dir: pair(p, 'dir', 'init.payload'),
          start: { total: field(p, 'total', 'init.payload'), through: field(p, 'through', 'init.payload') },
          vertices: [],
          step: null,
        };
      }
      case 'vertex': {
        const path = 'vertex.payload';
        if (!scene.start) bad(path, 'init 보다 먼저 왔다');
        const k = field(p, 'k', path);
        if (k !== scene.vertices.length + 1) bad(`${path}.k`, `다음 꼭짓점 번호(${scene.vertices.length + 1})가 아니다`);
        const surface = p.surface;
        if (typeof surface !== 'string' || !scene.base.surfaces.some((s) => s.id === surface)) {
          bad(`${path}.surface`, '바탕에 없는 면');
        }
        const from = pair(p, 'from', path);
        const prevVertex = scene.vertices[scene.vertices.length - 1];
        const expectFrom = prevVertex ? prevVertex.point : scene.base.eye;
        if (!same(from, expectFrom)) bad(`${path}.from`, '앞 꼭짓점(또는 눈)과 다르다');
        const before = field(p, 'before', path);
        const expectBefore = prevVertex ? prevVertex.total : scene.start.total;
        if (Math.abs(before - expectBefore) > 1e-12) bad(`${path}.before`, '지금 합과 다르다');
        const last = p.last;
        if (typeof last !== 'boolean') bad(`${path}.last`, '참거짓이 아니다');
        const vertex: Vertex = {
          k,
          surface: surface as SurfaceId,
          from,
          point: pair(p, 'point', path),
          cos: field(p, 'cos', path),
          dist: field(p, 'dist', path),
          direct: field(p, 'direct', path),
          through: field(p, 'through', path),
          add: field(p, 'add', path),
          before,
          total: field(p, 'total', path),
          last,
        };
        return { ...scene, vertices: [...scene.vertices, vertex], step: { k } };
      }
      default:
        bad(`event.type`, `모르는 이벤트 ${event.type}`);
    }
  },
};

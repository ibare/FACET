/**
 * 절두체 클리핑의 장면 — 이벤트를 잇기만 한다. 셈(d · 교점 · 넓이)은 알고리즘이 한다.
 *
 * 바탕: 처음 삼각형(original).
 * 자취: 지금까지 알려진 꼭짓점(vertices — 버린 것 · 새 것 포함)과 지금 다각형 차례(polygon).
 * 이번 걸음: step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { PLANES, narrowCutOutsideFrustumData } from './algorithm.js';
import type { PlaneId, Vec4 } from './algorithm.js';

export type NewVertex = { id: string; from: string; to: string; param: number };

export type CutStep =
  | { kind: 'start' }
  | {
      kind: 'cut';
      plane: PlaneId;
      distances: ReadonlyArray<{ id: string; d: number }>;
      dropped: readonly string[];
      added: readonly NewVertex[];
      /** 자르기 전 꼭짓점 수 */
      before: number;
    }
  | {
      kind: 'fan';
      triangles: ReadonlyArray<readonly [number, number, number]>;
      areaBefore: number;
      areaAfter: number;
      frameArea: number;
    };

export type CutOutsideFrustumScene = {
  original: ReadonlyArray<{ id: string; clip: Vec4 }>;
  vertices: Readonly<Record<string, Vec4>>;
  polygon: readonly string[];
  step: CutStep;
};

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${path}: 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${path}: 수가 아니다`);
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`${path}: 글자가 아니다`);
  return v;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`${path}: 배열이 아니다`);
  return v;
}

function vec4(v: unknown, path: string): Vec4 {
  const a = arr(v, path);
  if (a.length !== 4) throw new Error(`${path}: 성분이 넷이 아니다`);
  return [num(a[0], `${path}[0]`), num(a[1], `${path}[1]`), num(a[2], `${path}[2]`), num(a[3], `${path}[3]`)];
}

function plane(v: unknown, path: string): PlaneId {
  const s = str(v, path);
  const found = PLANES.find((p) => p === s);
  if (found === undefined) throw new Error(`${path}: 모르는 면 ${s}`);
  return found;
}

function reduceCut(scene: CutOutsideFrustumScene, payload: Record<string, unknown>): CutOutsideFrustumScene {
  const vertices: Record<string, Vec4> = { ...scene.vertices };
  const added = arr(payload.added, 'cut.added').map((raw, i): NewVertex => {
    const a = rec(raw, `cut.added[${i}]`);
    const id = str(a.id, `cut.added[${i}].id`);
    if (id in vertices) throw new Error(`cut.added[${i}].id: ${id} 가 이미 있다`);
    const from = str(a.from, `cut.added[${i}].from`);
    const to = str(a.to, `cut.added[${i}].to`);
    if (!(from in vertices)) throw new Error(`cut.added[${i}].from: ${from} 가 없다`);
    if (!(to in vertices)) throw new Error(`cut.added[${i}].to: ${to} 가 없다`);
    vertices[id] = vec4(a.clip, `cut.added[${i}].clip`);
    return { id, from, to, param: num(a.param, `cut.added[${i}].param`) };
  });
  const dropped = arr(payload.dropped, 'cut.dropped').map((raw, i) => {
    const id = str(raw, `cut.dropped[${i}]`);
    if (!scene.polygon.includes(id)) throw new Error(`cut.dropped[${i}]: ${id} 는 지금 다각형에 없다`);
    return id;
  });
  const distances = arr(payload.distances, 'cut.distances').map((raw, i) => {
    const r = rec(raw, `cut.distances[${i}]`);
    const id = str(r.id, `cut.distances[${i}].id`);
    if (!(id in vertices)) throw new Error(`cut.distances[${i}].id: ${id} 가 없다`);
    return { id, d: num(r.d, `cut.distances[${i}].d`) };
  });
  const polygon = arr(payload.polygon, 'cut.polygon').map((raw, i) => {
    const id = str(raw, `cut.polygon[${i}]`);
    if (!(id in vertices)) throw new Error(`cut.polygon[${i}]: ${id} 가 없다`);
    if (dropped.includes(id)) throw new Error(`cut.polygon[${i}]: 버린 ${id} 가 남아 있다`);
    return id;
  });
  return {
    original: scene.original,
    vertices,
    polygon,
    step: {
      kind: 'cut',
      plane: plane(payload.plane, 'cut.plane'),
      distances,
      dropped,
      added,
      before: scene.polygon.length,
    },
  };
}

function reduceFan(scene: CutOutsideFrustumScene, payload: Record<string, unknown>): CutOutsideFrustumScene {
  const n = scene.polygon.length;
  const triangles = arr(payload.triangles, 'fan.triangles').map((raw, i): readonly [number, number, number] => {
    const t3 = arr(raw, `fan.triangles[${i}]`);
    if (t3.length !== 3) throw new Error(`fan.triangles[${i}]: 자리가 셋이 아니다`);
    const idx = t3.map((k, j) => {
      const v = num(k, `fan.triangles[${i}][${j}]`);
      if (!Number.isInteger(v) || v < 0 || v >= n) throw new Error(`fan.triangles[${i}][${j}]: 다각형 밖 자리 ${v}`);
      return v;
    });
    return [idx[0]!, idx[1]!, idx[2]!];
  });
  return {
    original: scene.original,
    vertices: scene.vertices,
    polygon: scene.polygon,
    step: {
      kind: 'fan',
      triangles,
      areaBefore: num(payload.areaBefore, 'fan.areaBefore'),
      areaAfter: num(payload.areaAfter, 'fan.areaAfter'),
      frameArea: num(payload.frameArea, 'fan.frameArea'),
    },
  };
}

export const cutOutsideFrustumScene: ScenePlan<CutOutsideFrustumScene> = {
  initial(initialData: unknown): CutOutsideFrustumScene {
    const data = narrowCutOutsideFrustumData(initialData);
    const original = data.vertices.map((v) => ({ id: v.id, clip: [v.clip[0], v.clip[1], v.clip[2], v.clip[3]] as Vec4 }));
    const vertices: Record<string, Vec4> = {};
    for (const v of original) vertices[v.id] = v.clip;
    return { original, vertices, polygon: original.map((v) => v.id), step: { kind: 'start' } };
  },
  reduce(scene: CutOutsideFrustumScene, event: FacetRuntimeEvent): CutOutsideFrustumScene {
    switch (event.type) {
      case 'cut':
        return reduceCut(scene, rec(event.payload, 'cut.payload'));
      case 'fan':
        return reduceFan(scene, rec(event.payload, 'fan.payload'));
      default:
        throw new Error(`cutOutsideFrustumScene: 모르는 이벤트 ${event.type}`);
    }
  },
};

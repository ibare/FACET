/**
 * rotate-turns 의 장면.
 *
 * 바탕   vertices — 처음 삼각형 (initialData 에서 베낀다) · reach — 축척을 정하는 가장 먼 거리 (init)
 * 자취   measure  — 지금까지 돈 누적 각과 그 자리에서 잰 값 (걸음마다 갈아 끼운다. 호의 자취는 누적 각에서 나온다)
 * 이번   step     — 이번 걸음이 어느 각에서 얼마만큼 돌았나 (호 운동의 출발값)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  readRotateTurnsData,
  type Corner,
  type Measure,
  type MeasuredPoint,
  type Side,
  type Vertex,
} from './algorithm.js';

export type RotateTurnsScene = {
  vertices: Vertex[];
  reach: number | null;
  measure: Measure | null;
  step: { from: number; by: number } | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`rotateTurnsScene: ${path} 가 수가 아니다`);
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new Error(`rotateTurnsScene: ${path} 가 글자가 아니다`);
  return v;
}

function list(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`rotateTurnsScene: ${path} 가 배열이 아니다`);
  return v;
}

/** payload.measure 를 필드마다 좁히고, 꼭짓점이 바탕의 것과 같은 차례인지 본다. */
function readMeasure(raw: unknown, vertices: Vertex[], path: string): Measure {
  if (!isRecord(raw)) throw new Error(`rotateTurnsScene: ${path} 가 객체가 아니다`);
  const ids = vertices.map((v) => v.id);
  const points = list(raw.points, `${path}.points`).map((p, i): MeasuredPoint => {
    if (!isRecord(p)) throw new Error(`rotateTurnsScene: ${path}.points[${i}] 가 객체가 아니다`);
    const id = str(p.id, `${path}.points[${i}].id`);
    if (id !== ids[i]) throw new Error(`rotateTurnsScene: ${path}.points[${i}].id ${id} 가 바탕의 꼭짓점과 다르다`);
    return {
      id,
      x: num(p.x, `${path}.points[${i}].x`),
      y: num(p.y, `${path}.points[${i}].y`),
      r: num(p.r, `${path}.points[${i}].r`),
    };
  });
  if (points.length !== ids.length) throw new Error(`rotateTurnsScene: ${path}.points 의 수가 바탕과 다르다`);
  const sides = list(raw.sides, `${path}.sides`).map((s, i): Side => {
    if (!isRecord(s)) throw new Error(`rotateTurnsScene: ${path}.sides[${i}] 가 객체가 아니다`);
    const from = str(s.from, `${path}.sides[${i}].from`);
    const to = str(s.to, `${path}.sides[${i}].to`);
    if (!ids.includes(from) || !ids.includes(to)) throw new Error(`rotateTurnsScene: ${path}.sides[${i}] 가 바탕에 없는 꼭짓점을 가리킨다`);
    return { from, to, len: num(s.len, `${path}.sides[${i}].len`) };
  });
  const corners = list(raw.corners, `${path}.corners`).map((c, i): Corner => {
    if (!isRecord(c)) throw new Error(`rotateTurnsScene: ${path}.corners[${i}] 가 객체가 아니다`);
    const id = str(c.id, `${path}.corners[${i}].id`);
    if (!ids.includes(id)) throw new Error(`rotateTurnsScene: ${path}.corners[${i}].id ${id} 가 바탕에 없다`);
    return { id, deg: num(c.deg, `${path}.corners[${i}].deg`) };
  });
  if (!isRecord(raw.centroid)) throw new Error(`rotateTurnsScene: ${path}.centroid 가 객체가 아니다`);
  const centroid = {
    x: num(raw.centroid.x, `${path}.centroid.x`),
    y: num(raw.centroid.y, `${path}.centroid.y`),
    r: num(raw.centroid.r, `${path}.centroid.r`),
  };
  return { deg: num(raw.deg, `${path}.deg`), points, sides, corners, centroid };
}

export const rotateTurnsScene: ScenePlan<RotateTurnsScene> = {
  initial(initialData: unknown): RotateTurnsScene {
    const data = readRotateTurnsData(initialData);
    return {
      vertices: data.vertices.map((v) => ({ id: v.id, x: v.x, y: v.y })),
      reach: null,
      measure: null,
      step: null,
    };
  },

  reduce(scene: RotateTurnsScene, event: FacetRuntimeEvent): RotateTurnsScene {
    const payload = event.payload;
    switch (event.type) {
      case 'init': {
        if (!isRecord(payload)) throw new Error('rotateTurnsScene: init.payload 가 객체가 아니다');
        const reach = num(payload.reach, 'init.payload.reach');
        if (reach <= 0) throw new Error('rotateTurnsScene: init.payload.reach 가 0 이하다');
        const measure = readMeasure(payload.measure, scene.vertices, 'init.payload.measure');
        return { vertices: scene.vertices, reach, measure, step: null };
      }
      case 'turn': {
        if (!isRecord(payload)) throw new Error('rotateTurnsScene: turn.payload 가 객체가 아니다');
        if (scene.measure === null || scene.reach === null) throw new Error('rotateTurnsScene: init 앞에 turn 이 왔다');
        const from = num(payload.from, 'turn.payload.from');
        const by = num(payload.by, 'turn.payload.by');
        if (from !== scene.measure.deg) {
          throw new Error(`rotateTurnsScene: turn.payload.from ${from} 가 지금 각 ${scene.measure.deg} 와 다르다`);
        }
        const measure = readMeasure(payload.measure, scene.vertices, 'turn.payload.measure');
        if (measure.deg !== from + by) throw new Error('rotateTurnsScene: turn.payload.measure.deg 가 from + by 가 아니다');
        return { vertices: scene.vertices, reach: scene.reach, measure, step: { from, by } };
      }
      default:
        throw new Error(`rotateTurnsScene: 모르는 이벤트 ${event.type}`);
    }
  },
};

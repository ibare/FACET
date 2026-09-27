/**
 * scale-stretches 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 했다.
 *
 * 바탕: 처음 도형(initialData 에서 베낌) · 좌표 범위와 y 축 위 꼭짓점(init)
 * 자취: 걸음마다 잰 각 (벌어진 차례)
 * 이번 걸음: 앞 자리 · 앞 각 · 꼭짓점마다 간 거리 · 바뀐 축
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readScaleStretchesData, type StretchVertex } from './algorithm.js';

export interface StretchFrame {
  xMax: number;
  yMin: number;
  yMax: number;
  onAxis: string[];
}

export interface StretchNow {
  sx: number;
  sy: number;
  points: StretchVertex[];
  angle: number;
  edge: number;
}

export interface StretchStep {
  index: number;
  axis: 'x' | 'y' | 'both';
  grow: boolean;
  before: StretchVertex[];
  fromAngle: number;
  moved: { id: string; dist: number }[];
}

export interface ScaleStretchesScene {
  base: StretchVertex[];
  angleAt: string;
  frame: StretchFrame | null;
  now: StretchNow | null;
  /** 걸음마다 잰 각. 처음 각이 맨 앞 */
  angles: number[];
  step: StretchStep | null;
}

function bad(path: string, why: string): never {
  throw new Error(`scaleStretchesScene: ${path} — ${why}`);
}

function field(obj: unknown, key: string, path: string): unknown {
  if (typeof obj !== 'object' || obj === null) bad(path, '객체가 아니다');
  return (obj as Record<string, unknown>)[key];
}

function numAt(obj: unknown, key: string, path: string): number {
  const v = field(obj, key, path);
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${path}.${key}`, '수가 아니다');
  return v;
}

function strList(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) bad(path, '배열이 아니다');
  return v.map((s: unknown, i) => {
    if (typeof s !== 'string') bad(`${path}[${i}]`, '문자열이 아니다');
    return s;
  });
}

function copyPoints(pts: StretchVertex[]): StretchVertex[] {
  return pts.map((p) => ({ id: p.id, x: p.x, y: p.y }));
}

/** 바탕 꼭짓점과 같은 차례 · 같은 식별자인 자리 목록으로 좁힌다. */
function pointsLike(v: unknown, base: StretchVertex[], path: string): StretchVertex[] {
  if (!Array.isArray(v) || v.length !== base.length) bad(path, `꼭짓점 ${base.length} 개가 아니다`);
  return v.map((p: unknown, i) => {
    const id = field(p, 'id', `${path}[${i}]`);
    if (id !== base[i]!.id) bad(`${path}[${i}].id`, `바탕의 ${base[i]!.id} 와 다르다`);
    return { id: base[i]!.id, x: numAt(p, 'x', `${path}[${i}]`), y: numAt(p, 'y', `${path}[${i}]`) };
  });
}

function reduceInit(scene: ScaleStretchesScene, payload: unknown): ScaleStretchesScene {
  if (scene.frame !== null) bad('init', '바탕이 이미 섰다');
  const frame = field(payload, 'frame', 'init.payload');
  const onAxis = strList(field(payload, 'onAxis', 'init.payload'), 'init.payload.onAxis');
  for (const id of onAxis) {
    if (!scene.base.some((b) => b.id === id)) bad('init.payload.onAxis', `없는 꼭짓점 ${id}`);
  }
  const angle = numAt(payload, 'angle', 'init.payload');
  return {
    ...scene,
    base: copyPoints(scene.base),
    frame: {
      xMax: numAt(frame, 'xMax', 'init.payload.frame'),
      yMin: numAt(frame, 'yMin', 'init.payload.frame'),
      yMax: numAt(frame, 'yMax', 'init.payload.frame'),
      onAxis,
    },
    now: {
      sx: numAt(payload, 'sx', 'init.payload'),
      sy: numAt(payload, 'sy', 'init.payload'),
      points: copyPoints(scene.base),
      angle,
      edge: numAt(payload, 'edge', 'init.payload'),
    },
    angles: [angle],
    step: null,
  };
}

function reduceScale(scene: ScaleStretchesScene, payload: unknown): ScaleStretchesScene {
  const now = scene.now;
  if (now === null || scene.frame === null) bad('scale', '바탕(init) 보다 먼저 왔다');
  const fromAngle = numAt(payload, 'fromAngle', 'scale.payload');
  if (fromAngle !== now.angle) bad('scale.payload.fromAngle', `지금 각 ${now.angle} 과 다르다`);
  const axis = field(payload, 'axis', 'scale.payload');
  if (axis !== 'x' && axis !== 'y' && axis !== 'both') bad('scale.payload.axis', '모르는 축');
  const grow = field(payload, 'grow', 'scale.payload');
  if (typeof grow !== 'boolean') bad('scale.payload.grow', '참거짓이 아니다');
  const movedRaw = field(payload, 'moved', 'scale.payload');
  if (!Array.isArray(movedRaw) || movedRaw.length !== scene.base.length) {
    bad('scale.payload.moved', `꼭짓점 ${scene.base.length} 개가 아니다`);
  }
  const moved = movedRaw.map((m: unknown, i) => {
    const id = field(m, 'id', `scale.payload.moved[${i}]`);
    if (id !== scene.base[i]!.id) bad(`scale.payload.moved[${i}].id`, '바탕의 차례와 다르다');
    return { id: scene.base[i]!.id, dist: numAt(m, 'dist', `scale.payload.moved[${i}]`) };
  });
  const angle = numAt(payload, 'angle', 'scale.payload');
  return {
    ...scene,
    now: {
      sx: numAt(payload, 'sx', 'scale.payload'),
      sy: numAt(payload, 'sy', 'scale.payload'),
      points: pointsLike(field(payload, 'points', 'scale.payload'), scene.base, 'scale.payload.points'),
      angle,
      edge: numAt(payload, 'edge', 'scale.payload'),
    },
    angles: [...scene.angles, angle],
    step: {
      index: numAt(payload, 'index', 'scale.payload'),
      axis,
      grow,
      before: copyPoints(now.points),
      fromAngle,
      moved,
    },
  };
}

export const scaleStretchesScene: ScenePlan<ScaleStretchesScene> = {
  initial(initialData: unknown): ScaleStretchesScene {
    const data = readScaleStretchesData(initialData);
    return {
      base: copyPoints(data.vertices),
      angleAt: data.angleAt,
      frame: null,
      now: null,
      angles: [],
      step: null,
    };
  },
  reduce(scene: ScaleStretchesScene, event: FacetRuntimeEvent): ScaleStretchesScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'scale':
        return reduceScale(scene, event.payload);
      default:
        throw new Error(`scaleStretchesScene: 모르는 이벤트 ${event.type}`);
    }
  },
};

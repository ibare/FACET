/**
 * translate-slides 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 했다.
 *
 * 바탕  ids · frame · slideCount (init 이 한 번 정한다)
 * 자취  places — 걸음마다 선 자리. places[0] 이 처음 자리
 * 이번  step — 이번 옮김의 출발 자리(from) · 도착 자리(at) · 꼭짓점마다 잰 옮김
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowTranslateSlidesData,
  type Corner,
  type CornerShift,
  type Frame,
} from './algorithm.js';

export type SlideStep = {
  kind: 'slide';
  index: number;
  from: Corner[];
  at: Corner[];
  moved: CornerShift[];
  fromStart: CornerShift[];
};

export type TranslateSlidesScene = {
  ids: string[];
  frame: Frame | null;
  slideCount: number | null;
  places: Corner[][];
  step: SlideStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`translateSlidesScene: ${path} 가 유한한 수가 아니다`);
  }
  return v;
}

/** 꼭짓점 목록을 좁히고, 바탕의 식별자 차례와 같은지 본다. */
function readCorners(v: unknown, ids: string[], path: string): Corner[] {
  if (!Array.isArray(v)) throw new Error(`translateSlidesScene: ${path} 가 배열이 아니다`);
  if (v.length !== ids.length) {
    throw new Error(`translateSlidesScene: ${path} 의 길이 ${v.length} 가 꼭짓점 수 ${ids.length} 와 다르다`);
  }
  return v.map((c: unknown, i: number) => {
    if (!isRecord(c)) throw new Error(`translateSlidesScene: ${path}[${i}] 가 객체가 아니다`);
    if (c.id !== ids[i]) {
      throw new Error(`translateSlidesScene: ${path}[${i}].id '${String(c.id)}' 가 바탕의 '${ids[i]}' 와 다르다`);
    }
    return { id: ids[i]!, x: num(c.x, `${path}[${i}].x`), y: num(c.y, `${path}[${i}].y`) };
  });
}

function readShifts(v: unknown, ids: string[], path: string): CornerShift[] {
  if (!Array.isArray(v)) throw new Error(`translateSlidesScene: ${path} 가 배열이 아니다`);
  if (v.length !== ids.length) {
    throw new Error(`translateSlidesScene: ${path} 의 길이 ${v.length} 가 꼭짓점 수 ${ids.length} 와 다르다`);
  }
  return v.map((s: unknown, i: number) => {
    if (!isRecord(s)) throw new Error(`translateSlidesScene: ${path}[${i}] 가 객체가 아니다`);
    if (s.id !== ids[i]) {
      throw new Error(`translateSlidesScene: ${path}[${i}].id '${String(s.id)}' 가 바탕의 '${ids[i]}' 와 다르다`);
    }
    return { id: ids[i]!, dx: num(s.dx, `${path}[${i}].dx`), dy: num(s.dy, `${path}[${i}].dy`) };
  });
}

function reduceInit(scene: TranslateSlidesScene, payload: unknown): TranslateSlidesScene {
  if (scene.frame !== null) throw new Error('translateSlidesScene: init 이 두 번 왔다');
  if (!isRecord(payload)) throw new Error('translateSlidesScene: init.payload 가 객체가 아니다');
  const f = payload.frame;
  if (!isRecord(f)) throw new Error('translateSlidesScene: init.payload.frame 이 객체가 아니다');
  const frame: Frame = {
    minX: num(f.minX, 'init.payload.frame.minX'),
    maxX: num(f.maxX, 'init.payload.frame.maxX'),
    minY: num(f.minY, 'init.payload.frame.minY'),
    maxY: num(f.maxY, 'init.payload.frame.maxY'),
  };
  if (frame.minX > frame.maxX || frame.minY > frame.maxY) {
    throw new Error('translateSlidesScene: init.payload.frame 의 최솟값이 최댓값보다 크다');
  }
  const slideCount = num(payload.slideCount, 'init.payload.slideCount');
  if (!Number.isInteger(slideCount) || slideCount < 1) {
    throw new Error('translateSlidesScene: init.payload.slideCount 가 1 이상의 정수가 아니다');
  }
  return { ...scene, frame, slideCount, places: scene.places.map((ps) => ps.map((p) => ({ ...p }))) };
}

function reduceSlide(scene: TranslateSlidesScene, payload: unknown): TranslateSlidesScene {
  if (scene.frame === null || scene.slideCount === null) {
    throw new Error('translateSlidesScene: init 보다 slide 가 먼저 왔다');
  }
  if (!isRecord(payload)) throw new Error('translateSlidesScene: slide.payload 가 객체가 아니다');
  const index = num(payload.index, 'slide.payload.index');
  if (index !== scene.places.length) {
    throw new Error(`translateSlidesScene: slide.payload.index ${index} 가 다음 걸음 ${scene.places.length} 와 다르다`);
  }
  if (index > scene.slideCount) {
    throw new Error(`translateSlidesScene: slide.payload.index ${index} 가 옮김 수 ${scene.slideCount} 를 넘는다`);
  }
  const from = readCorners(payload.from, scene.ids, 'slide.payload.from');
  const last = scene.places[scene.places.length - 1];
  if (!last) throw new Error('translateSlidesScene: 자취가 비었다');
  from.forEach((p, i) => {
    const q = last[i];
    if (!q || q.x !== p.x || q.y !== p.y) {
      throw new Error(`translateSlidesScene: slide.payload.from[${i}] 가 지금 자리와 다르다`);
    }
  });
  const at = readCorners(payload.at, scene.ids, 'slide.payload.at');
  const moved = readShifts(payload.moved, scene.ids, 'slide.payload.moved');
  const fromStart = readShifts(payload.fromStart, scene.ids, 'slide.payload.fromStart');
  return {
    ...scene,
    places: [...scene.places.map((ps) => ps.map((p) => ({ ...p }))), at.map((p) => ({ ...p }))],
    step: { kind: 'slide', index, from, at, moved, fromStart },
  };
}

export const translateSlidesScene: ScenePlan<TranslateSlidesScene> = {
  initial(initialData: unknown): TranslateSlidesScene {
    const data = narrowTranslateSlidesData(initialData);
    return {
      ids: data.corners.map((c) => c.id),
      frame: null,
      slideCount: null,
      places: [data.corners.map((c) => ({ id: c.id, x: c.x, y: c.y }))],
      step: null,
    };
  },
  reduce(scene: TranslateSlidesScene, event: FacetRuntimeEvent): TranslateSlidesScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'slide':
        return reduceSlide(scene, event.payload);
      default:
        throw new Error(`translateSlidesScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};

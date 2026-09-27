/**
 * perspective-shrinks-far 장면.
 *
 * 바탕 — 화면까지의 거리 f 와 기둥들(initialData 에서 베낀다).
 * 자취 — 지금까지 비춘 기둥의 화면 값 (알고리즘이 셈해 싣는다).
 * 이번 걸음 — 처음 화면인가, 어느 기둥을 비췄는가.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readShrinkData, type ShrinkPost, type ShrinkProjection } from './algorithm.js';

export type ShrinkStep = { kind: 'start' } | { kind: 'project'; index: number };

export type PerspectiveShrinksFarScene = {
  focal: number;
  posts: ShrinkPost[];
  projected: ShrinkProjection[];
  step: ShrinkStep;
};

function numberField(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`perspectiveShrinksFarScene: project.payload.${key} 가 수가 아니다`);
  }
  return value;
}

function readProjection(scene: PerspectiveShrinksFarScene, raw: unknown): ShrinkProjection {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('perspectiveShrinksFarScene: project.payload 가 객체가 아니다');
  }
  const payload = raw as Record<string, unknown>;
  const index = numberField(payload, 'index');
  if (!Number.isInteger(index) || !scene.posts[index]) {
    throw new Error(`perspectiveShrinksFarScene: project.payload.index ${index} 인 기둥이 바탕에 없다`);
  }
  if (scene.projected.some((p) => p.index === index)) {
    throw new Error(`perspectiveShrinksFarScene: project.payload.index ${index} 는 이미 비췄다`);
  }
  const ratioRaw = payload.ratio;
  let ratio: number | null;
  if (ratioRaw === null) {
    if (scene.projected.length !== 0) {
      throw new Error('perspectiveShrinksFarScene: project.payload.ratio 가 null 인데 앞에 비춘 기둥이 있다');
    }
    ratio = null;
  } else {
    ratio = numberField(payload, 'ratio');
    if (scene.projected.length === 0) {
      throw new Error('perspectiveShrinksFarScene: 첫 기둥의 project.payload.ratio 는 null 이어야 한다');
    }
  }
  return {
    index,
    d: numberField(payload, 'd'),
    x: numberField(payload, 'x'),
    yBottom: numberField(payload, 'yBottom'),
    yTop: numberField(payload, 'yTop'),
    height: numberField(payload, 'height'),
    product: numberField(payload, 'product'),
    ratio,
  };
}

export const perspectiveShrinksFarScene: ScenePlan<PerspectiveShrinksFarScene> = {
  initial(initialData: unknown): PerspectiveShrinksFarScene {
    const data = readShrinkData(initialData);
    return {
      focal: data.focal,
      posts: data.posts.map((p) => ({ ...p })),
      projected: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: PerspectiveShrinksFarScene, event: FacetRuntimeEvent): PerspectiveShrinksFarScene {
    switch (event.type) {
      case 'project': {
        const shot = readProjection(scene, event.payload);
        return {
          focal: scene.focal,
          posts: scene.posts,
          projected: [...scene.projected, shot],
          step: { kind: 'project', index: shot.index },
        };
      }
      default:
        throw new Error(`perspectiveShrinksFarScene: 모르는 이벤트 ${event.type}`);
    }
  },
};

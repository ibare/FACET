/**
 * layoutPerFrame 의 장면.
 *
 * 바탕(init 이 한 번 정하는 것) — `width` · `frames` · `perFrame`. 애니메이션 내내
 * 바뀌지 않는다 (상자 너비는 특히 한 번도 바뀌지 않는다는 것이 이 조각의 주장이다).
 *
 * 자취 + 이번 걸음 — `frameNum` · `left` · `x` · `measured` · `painted` · `style` ·
 * `composite`. 매 장마다 통째로 갈아 끼운다(누적값 자체가 그 장의 결과이므로).
 *
 * `step` 이 이번 걸음의 종류를 stage 에 말한다 — `init` 은 애니메이션 전, `frame` 은
 * 장이 하나 돈 것.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type LayoutPerFrameStep = { kind: 'init' } | { kind: 'frame'; frameNum: number };

export type LayoutPerFrameScene = {
  width: number;
  frames: number;
  perFrame: number;
  frameNum: number;
  left: number;
  x: number;
  measured: number;
  painted: number;
  style: number;
  composite: number;
  step: LayoutPerFrameStep;
};

type LayoutPerFrameConfig = { frames: number; perFrame: number; width: number };

function readConfig(raw: unknown): LayoutPerFrameConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('layoutPerFrame: initialData 가 없다');
  }
  const cfg = raw as Record<string, unknown>;
  const { frames, perFrame, width } = cfg;
  if (typeof frames !== 'number' || typeof perFrame !== 'number' || typeof width !== 'number') {
    throw new Error('layoutPerFrame: initialData 의 frames · perFrame · width 가 숫자가 아니다');
  }
  return { frames, perFrame, width };
}

export const layoutPerFrameScene: ScenePlan<LayoutPerFrameScene> = {
  initial(initialData) {
    const { frames, perFrame, width } = readConfig(initialData);
    return {
      width,
      frames,
      perFrame,
      frameNum: 0,
      left: 0,
      x: 0,
      measured: 0,
      painted: 0,
      style: 0,
      composite: 0,
      step: { kind: 'init' },
    };
  },

  reduce(scene, event: FacetRuntimeEvent): LayoutPerFrameScene {
    if (event.type !== 'frame') return scene;
    const payload = event.payload;
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('layoutPerFrame: frame 이벤트에 payload 가 없다');
    }
    const p = payload as Record<string, unknown>;
    const { frameNum, left, x, width, measured, painted, style, composite } = p;
    if (
      typeof frameNum !== 'number' ||
      typeof left !== 'number' ||
      typeof x !== 'number' ||
      typeof width !== 'number' ||
      typeof measured !== 'number' ||
      typeof painted !== 'number' ||
      typeof style !== 'number' ||
      typeof composite !== 'number'
    ) {
      throw new Error('layoutPerFrame: frame payload 필드 타입이 어긋난다');
    }
    return {
      ...scene,
      frameNum,
      left,
      x,
      width,
      measured,
      painted,
      style,
      composite,
      step: { kind: 'frame', frameNum },
    };
  },
};

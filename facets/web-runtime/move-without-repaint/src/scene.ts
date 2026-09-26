import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 이번 걸음 — 바탕(init 이 한 번 정하는 것)과 자취(frame · x · composites)를
 * 가른 결과 얹히는 것. `advance` 는 지나간 자리(`from`)를 실어 stage 가 어디서부터
 * 미는지 스스로 말하게 한다 (prev 는 무엇을 흐르게 할지 고르는 데만 쓴다).
 */
export type MoveWithoutRepaintStep =
  | { kind: 'init' }
  | { kind: 'advance'; frame: number; x: number; composites: number; from: number };

export interface MoveWithoutRepaintScene {
  /** 애니메이션의 장 수 (바탕). */
  frames: number;
  /** 장마다 미는 거리 (바탕). */
  perFramePx: number;
  /** 칠한 횟수 — 이 조각 내내 바뀌지 않는다 (바탕). */
  paintedCount: number;
  /** 레이아웃(다시 잼) 횟수 — 이 조각 내내 0 이다 (바탕). */
  layoutCount: number;
  /** 장마다 바뀌는 CSS 선언 한 줄의 틀. `{x}` 를 이번 걸음의 x 로 바꿔 쓴다 (바탕). */
  codeTemplate: string;
  /** 지금까지 나온 장 번호. 0 은 아직 애니메이션이 시작하기 전 (자취). */
  frame: number;
  /** 칠한 장의 지금 자리 (자취). */
  x: number;
  /** 지금까지 합성한 횟수 (자취). */
  composites: number;
  step: MoveWithoutRepaintStep;
}

type Baseline = Pick<
  MoveWithoutRepaintScene,
  'frames' | 'perFramePx' | 'paintedCount' | 'layoutCount' | 'codeTemplate'
>;

function readBaseline(initialData: unknown): Baseline {
  if (typeof initialData !== 'object' || initialData === null) {
    throw new Error('move-without-repaint: initialData 가 객체가 아니다');
  }
  const d = initialData as Record<string, unknown>;
  const { frames, perFramePx, paintedCount, layoutCount, codeTemplate } = d;
  if (typeof frames !== 'number') throw new Error('move-without-repaint: initialData.frames 가 수가 아니다');
  if (typeof perFramePx !== 'number') throw new Error('move-without-repaint: initialData.perFramePx 가 수가 아니다');
  if (typeof paintedCount !== 'number') throw new Error('move-without-repaint: initialData.paintedCount 가 수가 아니다');
  if (typeof layoutCount !== 'number') throw new Error('move-without-repaint: initialData.layoutCount 가 수가 아니다');
  if (typeof codeTemplate !== 'string') throw new Error('move-without-repaint: initialData.codeTemplate 이 글자가 아니다');
  return { frames, perFramePx, paintedCount, layoutCount, codeTemplate };
}

export const moveWithoutRepaintScene: ScenePlan<MoveWithoutRepaintScene> = {
  initial(initialData) {
    const base = readBaseline(initialData);
    return { ...base, frame: 0, x: 0, composites: 0, step: { kind: 'init' } };
  },
  reduce(scene, event: FacetRuntimeEvent) {
    if (event.type !== 'move-without-repaint:frame') return scene;
    if (typeof event.payload !== 'object' || event.payload === null) return scene;
    const p = event.payload as Record<string, unknown>;
    const { frame, x, composites } = p;
    if (typeof frame !== 'number' || typeof x !== 'number' || typeof composites !== 'number') return scene;
    return {
      ...scene,
      frame,
      x,
      composites,
      step: { kind: 'advance', frame, x, composites, from: scene.x },
    };
  },
};

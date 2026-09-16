/**
 * @ffacet/algorithm-circular-buffer-wrap — 조각(piece) facet 번들.
 *
 * 끝에 닿으면 앞으로 돌아온다. algorithm / 장면 설계 / stage view / IR / facet JSON /
 * description 을 함께 묶고 등록 헬퍼를 제공한다. 등록 호출은 호스트 앱의 책임이다.
 */

export {
  circularBufferWrap,
  type CircularBufferWrapData,
} from './algorithm.js';
export { circularBufferWrapScene } from './scene.js';
export type {
  BufferCaption,
  BufferPointer,
  BufferRule,
  BufferSlots,
  BufferState,
  BufferStep,
  CircularBufferWrapScene,
} from './scene.js';
export { circularBufferWrapStageView } from './circular-buffer-wrap-stage.js';
export { circularBufferWrapIRs } from './irs.js';
export { circularBufferWrapFacet } from './facet.js';
export { circularBufferWrapDescription } from './description.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { circularBufferWrap, type CircularBufferWrapData } from './algorithm.js';
import { circularBufferWrapScene } from './scene.js';
import { circularBufferWrapStageView } from './circular-buffer-wrap-stage.js';
import { circularBufferWrapIRs } from './irs.js';
import { circularBufferWrapFacet } from './facet.js';
import { circularBufferWrapDescription } from './description.js';

/** algorithm / 장면 설계 / IR / stage view / facet / description 등록 헬퍼. */
export function registerCircularBufferWrap(): void {
  registerAlgorithm<CircularBufferWrapData>('circularBufferWrap', circularBufferWrap, {
    // 조각은 mount 시 스스로 시작하고 걸음 간격도 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerScenePlan('circularBufferWrapScene', circularBufferWrapScene);
  for (const ir of circularBufferWrapIRs) registerIR(ir.id, ir);
  registerView('circular-buffer-wrap-stage', circularBufferWrapStageView);
  registerFacets([circularBufferWrapFacet]);
  registerDescription(circularBufferWrapFacet.id, circularBufferWrapDescription);
}

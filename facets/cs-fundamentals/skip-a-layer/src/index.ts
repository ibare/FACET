/**
 * @ffacet/algorithm-skip-a-layer — 층이 여럿인 리스트에서 찾기 (조각).
 *
 * algorithm / scene / IR / facet JSON / description / 전용 stage view 를 담고
 * 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { skipALayer, type SkipALayerData } from './algorithm.js';
export {
  skipALayerScene,
  type SkipALayerScene,
  type SkipALayerStep,
  type SkipALayerCaption,
  type SkipLook,
  type SkipStop,
  type SkipVerdict,
} from './scene.js';
export { skipALayerIRs } from './irs.js';
export { skipALayerFacet } from './facet.js';
export { skipALayerDescription } from './description.js';
export { skipALayerStageView } from './skip-a-layer-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { skipALayer, type SkipALayerData } from './algorithm.js';
import { skipALayerScene } from './scene.js';
import { skipALayerIRs } from './irs.js';
import { skipALayerStageView } from './skip-a-layer-stage.js';
import { skipALayerFacet } from './facet.js';
import { skipALayerDescription } from './description.js';

/** algorithm / scene / IR / view / facet / description 등록 헬퍼. */
export function registerSkipALayer(): void {
  registerAlgorithm<SkipALayerData>('skipALayer', skipALayer, { mechanismKind: 'reactive' });
  registerScenePlan('skipALayerScene', skipALayerScene);
  for (const ir of skipALayerIRs) registerIR(ir.id, ir);
  registerView('skip-a-layer-stage', skipALayerStageView);
  registerFacets([skipALayerFacet]);
  registerDescription(skipALayerFacet.id, skipALayerDescription);
}

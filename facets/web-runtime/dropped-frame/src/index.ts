import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { droppedFrame, type DroppedFrameFacetData } from './algorithm.js';
import { droppedFrameScene } from './scene.js';
import { droppedFrameStageView } from './dropped-frame-stage.js';
import { droppedFrameIRs } from './irs.js';
import { droppedFrameFacet } from './facet.js';

export { droppedFrame, type DroppedFrameFacetData } from './algorithm.js';
export {
  droppedFrameScene,
  type DroppedFrameScene,
  type DroppedFrameStep,
  type DroppedFrameSummary,
  type FrameWork,
  type ScreenCell,
} from './scene.js';
export { droppedFrameStageView } from './dropped-frame-stage.js';
export { droppedFrameIRs } from './irs.js';
export { droppedFrameFacet } from './facet.js';

export function registerDroppedFrame(): void {
  registerAlgorithm<DroppedFrameFacetData>('droppedFrame', droppedFrame, { mechanismKind: 'reactive' });
  registerScenePlan('droppedFrameScene', droppedFrameScene);
  for (const ir of droppedFrameIRs) registerIR(ir.id, ir);
  registerView('dropped-frame-stage', droppedFrameStageView);
  registerFacets([droppedFrameFacet]);
}

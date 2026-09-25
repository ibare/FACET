import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { frameBoundary, type FrameBoundaryFacetData } from './algorithm.js';
import { frameBoundaryScene } from './scene.js';
import { frameBoundaryIRs } from './irs.js';
import { frameBoundaryStageView } from './frame-boundary-stage.js';
import { frameBoundaryFacet } from './facet.js';

export { frameBoundary, type FrameBoundaryFacetData } from './algorithm.js';
export {
  frameBoundaryScene,
  type FrameBoundaryScene,
  type FrameStep,
  type GotByte,
  type ReadKind,
  type ReceiverState,
} from './scene.js';
export { frameBoundaryIRs } from './irs.js';
export { frameBoundaryStageView } from './frame-boundary-stage.js';
export { frameBoundaryFacet } from './facet.js';

export function registerFrameBoundary(): void {
  registerAlgorithm<FrameBoundaryFacetData>('frameBoundary', frameBoundary, { mechanismKind: 'reactive' });
  registerScenePlan('frameBoundaryScene', frameBoundaryScene);
  for (const ir of frameBoundaryIRs) registerIR(ir.id, ir);
  registerView('frame-boundary-stage', frameBoundaryStageView);
  registerFacets([frameBoundaryFacet]);
}

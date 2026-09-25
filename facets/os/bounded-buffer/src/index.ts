import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { boundedBuffer, type BoundedBufferFacetData } from './algorithm.js';
import { boundedBufferScene } from './scene.js';
import { boundedBufferIRs } from './irs.js';
import { boundedBufferStageView } from './bounded-buffer-stage.js';
import { boundedBufferFacet } from './facet.js';

export { boundedBuffer, type BoundedBufferFacetData } from './algorithm.js';
export { boundedBufferScene, type BoundedBufferScene, type BoundedBufferStep } from './scene.js';
export { boundedBufferIRs } from './irs.js';
export { boundedBufferStageView } from './bounded-buffer-stage.js';
export { boundedBufferFacet } from './facet.js';

export function registerBoundedBuffer(): void {
  registerAlgorithm<BoundedBufferFacetData>('boundedBuffer', boundedBuffer, { mechanismKind: 'reactive' });
  registerScenePlan('boundedBufferScene', boundedBufferScene);
  for (const ir of boundedBufferIRs) registerIR(ir.id, ir);
  registerView('bounded-buffer-stage', boundedBufferStageView);
  registerFacets([boundedBufferFacet]);
}

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { serveFromNear, type ServeFromNearFacetData } from './algorithm.js';
import { serveFromNearScene } from './scene.js';
import { serveFromNearIRs } from './irs.js';
import { serveFromNearStageView } from './serve-from-near-stage.js';
import { serveFromNearFacet } from './facet.js';

export { serveFromNear, readServeFromNearData, nearestEdge, type ServeFromNearFacetData } from './algorithm.js';
export {
  serveFromNearScene,
  type ServeFromNearScene,
  type ServeFromNearBase,
  type ServeFromNearTally,
  type ServeFromNearStep,
  type ServedRequest,
} from './scene.js';
export { serveFromNearIRs } from './irs.js';
export { serveFromNearStageView } from './serve-from-near-stage.js';
export { serveFromNearFacet } from './facet.js';

export function registerServeFromNear(): void {
  registerAlgorithm<ServeFromNearFacetData>('serveFromNear', serveFromNear, { mechanismKind: 'reactive' });
  registerScenePlan('serveFromNearScene', serveFromNearScene);
  for (const ir of serveFromNearIRs) registerIR(ir.id, ir);
  registerView('serve-from-near-stage', serveFromNearStageView);
  registerFacets([serveFromNearFacet]);
}

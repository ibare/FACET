import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { depthTest, type DepthTestFacetData } from './algorithm.js';
import { depthTestScene } from './scene.js';
import { depthTestIRs } from './irs.js';
import { depthTestStageView } from './depth-test-stage.js';
import { depthTestFacet } from './facet.js';

export { depthTest, narrowDepthTestData, plateDepth, TIE_GAP } from './algorithm.js';
export type { DepthTestFacetData, DepthPlane, Plate, RowCell } from './algorithm.js';
export { depthTestScene } from './scene.js';
export type { DepthTestScene, DepthTestStep, SceneCell, ScenePlate } from './scene.js';
export { depthTestIRs } from './irs.js';
export { depthTestStageView } from './depth-test-stage.js';
export { depthTestFacet } from './facet.js';

export function registerDepthTest(): void {
  registerAlgorithm<DepthTestFacetData>('depthTest', depthTest, { mechanismKind: 'reactive' });
  registerScenePlan('depthTestScene', depthTestScene);
  for (const ir of depthTestIRs) registerIR(ir.id, ir);
  registerView('depth-test-stage', depthTestStageView);
  registerFacets([depthTestFacet]);
}

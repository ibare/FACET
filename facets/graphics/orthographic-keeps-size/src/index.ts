import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { orthographicKeepsSize, type OrthographicKeepsSizeFacetData } from './algorithm.js';
import { orthographicKeepsSizeScene } from './scene.js';
import { orthographicKeepsSizeStageView } from './orthographic-keeps-size-stage.js';
import { orthographicKeepsSizeIRs } from './irs.js';
import { orthographicKeepsSizeFacet } from './facet.js';

export { orthographicKeepsSize, narrowOrthographicData, type OrthographicKeepsSizeFacetData } from './algorithm.js';
export { orthographicKeepsSizeScene, type OrthographicKeepsSizeScene } from './scene.js';
export { orthographicKeepsSizeStageView } from './orthographic-keeps-size-stage.js';
export { orthographicKeepsSizeIRs } from './irs.js';
export { orthographicKeepsSizeFacet } from './facet.js';

export function registerOrthographicKeepsSize(): void {
  registerAlgorithm<OrthographicKeepsSizeFacetData>('orthographicKeepsSize', orthographicKeepsSize, { mechanismKind: 'reactive' });
  registerScenePlan('orthographicKeepsSizeScene', orthographicKeepsSizeScene);
  for (const ir of orthographicKeepsSizeIRs) registerIR(ir.id, ir);
  registerView('orthographic-keeps-size-stage', orthographicKeepsSizeStageView);
  registerFacets([orthographicKeepsSizeFacet]);
}

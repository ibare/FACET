import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { riemannSum, type RiemannSumFacetData } from './algorithm.js';
import { riemannSumScene } from './scene.js';
import { riemannSumStageView } from './riemann-sum-stage.js';
import { riemannSumIRs } from './irs.js';
import { riemannSumFacet } from './facet.js';

export { riemannSum, type RiemannSumFacetData } from './algorithm.js';
export { riemannSumScene, type RiemannSumScene } from './scene.js';
export { riemannSumStageView } from './riemann-sum-stage.js';
export { riemannSumIRs } from './irs.js';
export { riemannSumFacet } from './facet.js';

export function registerRiemannSum(): void {
  registerAlgorithm<RiemannSumFacetData>('riemannSum', riemannSum, { mechanismKind: 'reactive' });
  registerScenePlan('riemannSumScene', riemannSumScene);
  for (const ir of riemannSumIRs) registerIR(ir.id, ir);
  registerView('riemann-sum-stage', riemannSumStageView);
  registerFacets([riemannSumFacet]);
}

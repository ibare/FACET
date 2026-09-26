import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { localMinimum, type LocalMinimumFacetData } from './algorithm.js';
import { localMinimumScene } from './scene.js';
import { localMinimumStageView } from './local-minimum-stage.js';
import { localMinimumIRs } from './irs.js';
import { localMinimumFacet } from './facet.js';

export { localMinimum, narrowLocalMinimumData, lossAt, slopeAt } from './algorithm.js';
export type { LocalMinimumFacetData, LossCoefficients, Point, Spot } from './algorithm.js';
export { localMinimumScene } from './scene.js';
export type { LocalMinimumScene, LocalMinimumBase, LocalMinimumStep } from './scene.js';
export { localMinimumStageView } from './local-minimum-stage.js';
export { localMinimumIRs } from './irs.js';
export { localMinimumFacet } from './facet.js';

export function registerLocalMinimum(): void {
  registerAlgorithm<LocalMinimumFacetData>('localMinimum', localMinimum, { mechanismKind: 'reactive' });
  registerScenePlan('localMinimumScene', localMinimumScene);
  for (const ir of localMinimumIRs) registerIR(ir.id, ir);
  registerView('local-minimum-stage', localMinimumStageView);
  registerFacets([localMinimumFacet]);
}

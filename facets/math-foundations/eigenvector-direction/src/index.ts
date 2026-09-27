import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { eigenvectorDirection, type EigenvectorDirectionFacetData } from './algorithm';
import { eigenvectorDirectionScene } from './scene';
import { eigenvectorDirectionStageView } from './eigenvector-direction-stage';
import { eigenvectorDirectionIRs } from './irs';
import { eigenvectorDirectionFacet } from './facet';

export {
  eigenvectorDirection,
  narrowEigenvectorDirectionData,
  applyMatrix,
  type EigenvectorDirectionFacetData,
} from './algorithm';
export { eigenvectorDirectionScene, type EigenvectorDirectionScene } from './scene';
export { eigenvectorDirectionStageView } from './eigenvector-direction-stage';
export { eigenvectorDirectionIRs } from './irs';
export { eigenvectorDirectionFacet } from './facet';

export function registerEigenvectorDirection(): void {
  registerAlgorithm<EigenvectorDirectionFacetData>('eigenvectorDirection', eigenvectorDirection, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('eigenvectorDirectionScene', eigenvectorDirectionScene);
  for (const ir of eigenvectorDirectionIRs) registerIR(ir.id, ir);
  registerView('eigenvector-direction-stage', eigenvectorDirectionStageView);
  registerFacets([eigenvectorDirectionFacet]);
}

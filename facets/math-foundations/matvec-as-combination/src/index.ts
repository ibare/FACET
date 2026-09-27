import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { matvecAsCombination, type MatvecAsCombinationFacetData } from './algorithm.js';
import { matvecAsCombinationScene } from './scene.js';
import { matvecAsCombinationIRs } from './irs.js';
import { matvecAsCombinationStageView } from './matvec-as-combination-stage.js';
import { matvecAsCombinationFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './matvec-as-combination-stage.js';
export * from './facet.js';

export function registerMatvecAsCombination(): void {
  registerAlgorithm<MatvecAsCombinationFacetData>('matvecAsCombination', matvecAsCombination, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('matvecAsCombinationScene', matvecAsCombinationScene);
  for (const ir of matvecAsCombinationIRs) registerIR(ir.id, ir);
  registerView('matvec-as-combination-stage', matvecAsCombinationStageView);
  registerFacets([matvecAsCombinationFacet]);
}

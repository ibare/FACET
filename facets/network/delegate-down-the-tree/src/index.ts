import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { delegateDownTheTree, type DelegateDownTheTreeFacetData } from './algorithm.js';
import { delegateDownTheTreeScene } from './scene.js';
import { delegateDownTheTreeIRs } from './irs.js';
import { delegateDownTheTreeStageView } from './delegate-down-the-tree-stage.js';
import { delegateDownTheTreeFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './delegate-down-the-tree-stage.js';
export * from './facet.js';

export function registerDelegateDownTheTree(): void {
  registerAlgorithm<DelegateDownTheTreeFacetData>('delegateDownTheTree', delegateDownTheTree, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('delegateDownTheTreeScene', delegateDownTheTreeScene);
  for (const ir of delegateDownTheTreeIRs) registerIR(ir.id, ir);
  registerView('delegate-down-the-tree-stage', delegateDownTheTreeStageView);
  registerFacets([delegateDownTheTreeFacet]);
}

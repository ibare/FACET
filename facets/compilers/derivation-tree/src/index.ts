import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { derivationTree, type DerivationTreeFacetData } from './algorithm.js';
import { derivationTreeScene } from './scene.js';
import { derivationTreeStageView } from './derivation-tree-stage.js';
import { derivationTreeIRs } from './irs.js';
import { derivationTreeFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './derivation-tree-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerDerivationTree(): void {
  registerAlgorithm<DerivationTreeFacetData>('derivationTree', derivationTree, { mechanismKind: 'reactive' });
  registerScenePlan('derivationTreeScene', derivationTreeScene);
  for (const ir of derivationTreeIRs) registerIR(ir.id, ir);
  registerView('derivation-tree-stage', derivationTreeStageView);
  registerFacets([derivationTreeFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { inverseUndoes, type InverseUndoesFacetData } from './algorithm.js';
import { inverseUndoesScene } from './scene.js';
import { inverseUndoesIRs } from './irs.js';
import { inverseUndoesStageView } from './inverse-undoes-stage.js';
import { inverseUndoesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './inverse-undoes-stage.js';
export * from './facet.js';

export function registerInverseUndoes(): void {
  registerAlgorithm<InverseUndoesFacetData>('inverseUndoes', inverseUndoes, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('inverseUndoesScene', inverseUndoesScene);
  for (const ir of inverseUndoesIRs) registerIR(ir.id, ir);
  registerView('inverse-undoes-stage', inverseUndoesStageView);
  registerFacets([inverseUndoesFacet]);
}

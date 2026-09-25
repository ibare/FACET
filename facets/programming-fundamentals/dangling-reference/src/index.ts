import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { danglingReference, type DanglingReferenceFacetData } from './algorithm';
import { danglingReferenceScene } from './scene';
import { danglingReferenceIRs } from './irs';
import { danglingReferenceStageView } from './dangling-reference-stage';
import { danglingReferenceFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './irs';
export * from './dangling-reference-stage';
export * from './facet';

export function registerDanglingReference(): void {
  registerAlgorithm<DanglingReferenceFacetData>('danglingReference', danglingReference, { mechanismKind: 'reactive' });
  registerScenePlan('danglingReferenceScene', danglingReferenceScene);
  for (const ir of danglingReferenceIRs) registerIR(ir.id, ir);
  registerView('dangling-reference-stage', danglingReferenceStageView);
  registerFacets([danglingReferenceFacet]);
}

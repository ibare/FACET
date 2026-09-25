import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pointerDereference, type PointerDereferenceFacetData } from './algorithm.js';
import { pointerDereferenceScene } from './scene.js';
import { pointerDereferenceStageView } from './pointer-dereference-stage.js';
import { pointerDereferenceIRs } from './irs.js';
import { pointerDereferenceFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './pointer-dereference-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerPointerDereference(): void {
  registerAlgorithm<PointerDereferenceFacetData>('pointerDereference', pointerDereference, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('pointerDereferenceScene', pointerDereferenceScene);
  for (const ir of pointerDereferenceIRs) registerIR(ir.id, ir);
  registerView('pointer-dereference-stage', pointerDereferenceStageView);
  registerFacets([pointerDereferenceFacet]);
}

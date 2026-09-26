/**
 * type-checking — 등록. 손잡이가 있으니 reactive.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { typeCheckingAlgorithm, type TypeCheckingData } from './algorithm.js';
import { typeCheckingProjector } from './projector.js';
import { typeCheckingIRs } from './irs.js';
import { typeCheckingStageView } from './type-checking-stage.js';
import { typeCheckingFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './type-checking-stage.js';
export * from './facet.js';

export function registerTypeChecking(): void {
  registerAlgorithm<TypeCheckingData>('typeChecking', typeCheckingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('typeCheckingProjector', typeCheckingProjector);
  for (const ir of typeCheckingIRs) registerIR(ir.id, ir);
  registerView('type-checking-stage', typeCheckingStageView);
  registerFacets([typeCheckingFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { globalIlluminationAlgorithm, type GlobalIlluminationData } from './algorithm.js';
import { globalIlluminationProjector } from './projector.js';
import { globalIlluminationIRs } from './irs.js';
import { globalIlluminationStageView } from './global-illumination-stage.js';
import { globalIlluminationFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './global-illumination-stage.js';
export * from './facet.js';

export function registerGlobalIllumination(): void {
  registerAlgorithm<GlobalIlluminationData>('globalIllumination', globalIlluminationAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('globalIlluminationProjector', globalIlluminationProjector);
  for (const ir of globalIlluminationIRs) registerIR(ir.id, ir);
  registerView('global-illumination-stage', globalIlluminationStageView);
  registerFacets([globalIlluminationFacet]);
}

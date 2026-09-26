import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { ssaFormAlgorithm, type SsaFormData } from './algorithm.js';
import { ssaFormFacet } from './facet.js';
import { ssaFormIRs } from './irs.js';
import { ssaFormProjector } from './projector.js';
import { ssaFormStageView } from './ssa-form-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './ssa-form-stage.js';

/** ssa-form 을 레지스트리에 올린다 — 손잡이가 있어 reactive */
export function registerSsaForm(): void {
  registerAlgorithm<SsaFormData>('ssaForm', ssaFormAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('ssaFormProjector', ssaFormProjector);
  for (const ir of ssaFormIRs) registerIR(ir.id, ir);
  registerView('ssa-form-stage', ssaFormStageView);
  registerFacets([ssaFormFacet]);
}

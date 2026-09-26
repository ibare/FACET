/**
 * normal-forms — 등록 진입점. 호출은 호스트의 몫이다 (여기서 스스로 부르지 않는다).
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { normalFormsAlgorithm, type NormalFormsData } from './algorithm.js';
import { normalFormsProjector } from './projector.js';
import { normalFormsIRs } from './irs.js';
import { normalFormsStageView } from './normal-forms-stage.js';
import { normalFormsFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './normal-forms-stage.js';
export * from './facet.js';

export function registerNormalForms(): void {
  registerAlgorithm<NormalFormsData>('normalForms', normalFormsAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('normalFormsProjector', normalFormsProjector);
  for (const ir of normalFormsIRs) registerIR(ir.id, ir);
  registerView('normal-forms-stage', normalFormsStageView);
  registerFacets([normalFormsFacet]);
}

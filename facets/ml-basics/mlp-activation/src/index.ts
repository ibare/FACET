/**
 * facet:mlpActivation — 다층 퍼셉트론과 활성화. 등록은 호스트가 registerMlpActivation() 으로 한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { mlpActivationAlgorithm, type MlpActivationData } from './algorithm.js';
import { mlpActivationProjector } from './projector.js';
import { mlpActivationIRs } from './irs.js';
import { mlpActivationStageView } from './mlp-activation-stage.js';
import { mlpActivationFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './mlp-activation-stage.js';
export * from './facet.js';

export function registerMlpActivation(): void {
  registerAlgorithm<MlpActivationData>('mlpActivation', mlpActivationAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('mlpActivationProjector', mlpActivationProjector);
  for (const ir of mlpActivationIRs) registerIR(ir.id, ir);
  registerView('mlp-activation-stage', mlpActivationStageView);
  registerFacets([mlpActivationFacet]);
}

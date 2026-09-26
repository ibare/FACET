import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { backpropAlgorithm, type BackpropData } from './algorithm.js';
import { backpropProjector } from './projector.js';
import { backpropIRs } from './irs.js';
import { backpropStageView } from './backprop-stage.js';
import { backpropFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './backprop-stage.js';
export * from './facet.js';

/** 손잡이(은닉 폭 · 밀어 볼 폭 ε)가 있어 reactive 로 등록한다 */
export function registerBackprop(): void {
  registerAlgorithm<BackpropData>('backprop', backpropAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('backpropProjector', backpropProjector);
  for (const ir of backpropIRs) registerIR(ir.id, ir);
  registerView('backprop-stage', backpropStageView);
  registerFacets([backpropFacet]);
}

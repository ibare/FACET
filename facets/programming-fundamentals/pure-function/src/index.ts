import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { pureFunctionAlgorithm, type PureFunctionData } from './algorithm.js';
import { pureFunctionFacet } from './facet.js';
import { pureFunctionIRs } from './irs.js';
import { pureFunctionProjector } from './projector.js';
import { pureFunctionStageView } from './pure-function-stage.js';

export { pureFunctionAlgorithm, type PureFunctionData, type PureFunctionCall } from './algorithm.js';
export { pureFunctionProjector } from './projector.js';
export { pureFunctionImperativeIR, pureFunctionIRs } from './irs.js';
export { pureFunctionStageView, type PureFunctionStage } from './pure-function-stage.js';
export { pureFunctionFacet } from './facet.js';

/** 순수와 차례 facet 을 등록한다. 손잡이(order · mode)를 받으므로 reactive 다. */
export function registerPureFunction(): void {
  registerAlgorithm<PureFunctionData>('pureFunction', pureFunctionAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('pureFunctionProjector', pureFunctionProjector);
  for (const ir of pureFunctionIRs) registerIR(ir.id, ir);
  registerView('pure-function-stage', pureFunctionStageView);
  registerFacets([pureFunctionFacet]);
}

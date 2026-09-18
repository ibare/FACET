import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { outOfOrderExecutionAlgorithm } from './algorithm.js';
import { outOfOrderExecutionProjector } from './projector.js';
import { outOfOrderExecutionIRs } from './irs.js';
import { outOfOrderExecutionStageView } from './out-of-order-execution-stage.js';
import { outOfOrderExecutionFacet } from './facet.js';

export {
  outOfOrderExecutionAlgorithm,
  simulateOutOfOrder,
  decodeInstruction,
} from './algorithm.js';
export type {
  OutOfOrderExecutionData,
  OutOfOrderResult,
  OutOfOrderStep,
  OutOfOrderIssue,
  DecodedInstruction,
} from './algorithm.js';
export { outOfOrderExecutionProjector } from './projector.js';
export { outOfOrderExecutionImperativeIR, outOfOrderExecutionIRs } from './irs.js';
export { outOfOrderExecutionStageView } from './out-of-order-execution-stage.js';
export type { OutOfOrderStageSurface } from './out-of-order-execution-stage.js';
export { outOfOrderExecutionFacet } from './facet.js';

/** 알고리즘 · projector · IR · stage · facet 을 등록한다. 손잡이가 있으니 reactive 다. */
export function registerOutOfOrderExecution(): void {
  registerAlgorithm('outOfOrderExecution', outOfOrderExecutionAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('outOfOrderExecutionProjector', outOfOrderExecutionProjector);
  for (const ir of outOfOrderExecutionIRs) registerIR(ir.id, ir);
  registerView('out-of-order-execution-stage', outOfOrderExecutionStageView);
  registerFacets([outOfOrderExecutionFacet]);
}

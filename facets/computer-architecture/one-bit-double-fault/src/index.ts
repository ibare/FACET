import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { oneBitDoubleFault, type OneBitDoubleFaultFacetData } from './algorithm.js';
import { oneBitDoubleFaultScene } from './scene.js';
import { oneBitDoubleFaultStageView } from './one-bit-double-fault-stage.js';
import { oneBitDoubleFaultIRs } from './irs.js';
import { oneBitDoubleFaultFacet } from './facet.js';

export { oneBitDoubleFault, type Bit, type OneBitDoubleFaultFacetData } from './algorithm.js';
export {
  oneBitDoubleFaultScene,
  isChainedMiss,
  type OneBitScene,
  type OneBitStep,
  type Judged,
} from './scene.js';
export { oneBitDoubleFaultStageView } from './one-bit-double-fault-stage.js';
export { oneBitDoubleFaultIRs } from './irs.js';
export { oneBitDoubleFaultFacet } from './facet.js';

export function registerOneBitDoubleFault(): void {
  registerAlgorithm<OneBitDoubleFaultFacetData>('oneBitDoubleFault', oneBitDoubleFault, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('oneBitDoubleFaultScene', oneBitDoubleFaultScene);
  for (const ir of oneBitDoubleFaultIRs) registerIR(ir.id, ir);
  registerView('one-bit-double-fault-stage', oneBitDoubleFaultStageView);
  registerFacets([oneBitDoubleFaultFacet]);
}

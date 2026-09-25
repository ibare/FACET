import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pageFault, type PageFaultFacetData } from './algorithm';
import { pageFaultScene } from './scene';
import { pageFaultStageView } from './page-fault-stage';
import { pageFaultIRs } from './irs';
import { pageFaultFacet } from './facet';

export { pageFault, type PageFaultFacetData, type PageFaultRow } from './algorithm';
export {
  pageFaultScene,
  type PageFaultScene,
  type PageFaultStep,
  type PageFaultSlot,
  type PageFaultTableRow,
} from './scene';
export { pageFaultStageView } from './page-fault-stage';
export { pageFaultIRs } from './irs';
export { pageFaultFacet } from './facet';

export function registerPageFault(): void {
  registerAlgorithm<PageFaultFacetData>('pageFault', pageFault, { mechanismKind: 'reactive' });
  registerScenePlan('pageFaultScene', pageFaultScene);
  for (const ir of pageFaultIRs) registerIR(ir.id, ir);
  registerView('page-fault-stage', pageFaultStageView);
  registerFacets([pageFaultFacet]);
}

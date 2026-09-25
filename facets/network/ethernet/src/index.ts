import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { ethernetAlgorithm, type EthernetData } from './algorithm.js';
import { ethernetProjector } from './projector.js';
import { ethernetIRs } from './irs.js';
import { ethernetStageView } from './ethernet-stage.js';
import { ethernetFacet } from './facet.js';

export {
  ethernetAlgorithm,
  simulateCsma,
  LCG,
  MAX_SLOTS,
  WINDOW_CAP_IN_IR,
  type EthernetData,
  type CsmaEvent,
  type CsmaPick,
  type CsmaRun,
} from './algorithm.js';
export { ethernetProjector } from './projector.js';
export { ethernetImperativeIR, ethernetIRs } from './irs.js';
export { ethernetStageView, type EthernetStage } from './ethernet-stage.js';
export { ethernetFacet } from './facet.js';

export function registerEthernet(): void {
  registerAlgorithm<EthernetData>('ethernet', ethernetAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('ethernetProjector', ethernetProjector);
  for (const ir of ethernetIRs) registerIR(ir.id, ir);
  registerView('ethernet-stage', ethernetStageView);
  registerFacets([ethernetFacet]);
}

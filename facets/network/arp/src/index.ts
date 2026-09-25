import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { arpAlgorithm, type ArpData } from './algorithm.js';
import { arpProjector } from './projector.js';
import { arpIRs } from './irs.js';
import { arpStageView } from './arp-stage.js';
import { arpFacet } from './facet.js';

export { arpAlgorithm, arpCompute, arpHops, arpIrArgs, prefixOctets } from './algorithm.js';
export type { ArpData, ArpHop, ArpIface, ArpNode, ArpResult, ArpRoute, ArpTableRow } from './algorithm.js';
export { arpProjector } from './projector.js';
export { arpImperativeIR, arpIRs } from './irs.js';
export { arpStageView } from './arp-stage.js';
export type { ArpHopView, ArpPickView, ArpRoundView, ArpStageApi } from './arp-stage.js';
export { arpFacet } from './facet.js';

export function registerArp(): void {
  registerAlgorithm<ArpData>('arp', arpAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('arpProjector', arpProjector);
  for (const ir of arpIRs) registerIR(ir.id, ir);
  registerView('arp-stage', arpStageView);
  registerFacets([arpFacet]);
}

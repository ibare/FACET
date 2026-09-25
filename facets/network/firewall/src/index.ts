import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { firewallAlgorithm, type FirewallData } from './algorithm.js';
import { firewallProjector } from './projector.js';
import { firewallIRs } from './irs.js';
import { firewallStageView } from './firewall-stage.js';
import { firewallFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './firewall-stage.js';
export * from './facet.js';

export function registerFirewall(): void {
  registerAlgorithm<FirewallData>('firewall', firewallAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('firewallProjector', firewallProjector);
  for (const ir of firewallIRs) registerIR(ir.id, ir);
  registerView('firewall-stage', firewallStageView);
  registerFacets([firewallFacet]);
}

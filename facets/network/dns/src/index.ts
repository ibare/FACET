import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { dnsAlgorithm, type DnsData } from './algorithm.js';
import { dnsProjector } from './projector.js';
import { dnsIRs } from './irs.js';
import { dnsStageView } from './dns-stage.js';
import { dnsFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './dns-stage.js';
export * from './facet.js';

export function registerDns(): void {
  registerAlgorithm<DnsData>('dns', dnsAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('dnsProjector', dnsProjector);
  for (const ir of dnsIRs) registerIR(ir.id, ir);
  registerView('dns-stage', dnsStageView);
  registerFacets([dnsFacet]);
}

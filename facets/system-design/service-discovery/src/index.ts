/**
 * 서비스 디스커버리 — 등록. 손잡이(만료 길이)가 있어 reactive 로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { serviceDiscoveryAlgorithm, type ServiceDiscoveryData } from './algorithm.js';
import { serviceDiscoveryProjector } from './projector.js';
import { serviceDiscoveryIRs } from './irs.js';
import { serviceDiscoveryStageView } from './service-discovery-stage.js';
import { serviceDiscoveryFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './service-discovery-stage.js';
export * from './facet.js';

export function registerServiceDiscovery(): void {
  registerAlgorithm<ServiceDiscoveryData>('serviceDiscovery', serviceDiscoveryAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('serviceDiscoveryProjector', serviceDiscoveryProjector);
  for (const ir of serviceDiscoveryIRs) registerIR(ir.id, ir);
  registerView('service-discovery-stage', serviceDiscoveryStageView);
  registerFacets([serviceDiscoveryFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { portDemultiplex, type PortDemultiplexFacetData } from './algorithm';
import { portDemultiplexScene } from './scene';
import { portDemultiplexIRs } from './irs';
import { portDemultiplexStageView } from './port-demultiplex-stage';
import { portDemultiplexFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './irs';
export * from './port-demultiplex-stage';
export * from './facet';

export function registerPortDemultiplex(): void {
  registerAlgorithm<PortDemultiplexFacetData>('portDemultiplex', portDemultiplex, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('portDemultiplexScene', portDemultiplexScene);
  for (const ir of portDemultiplexIRs) registerIR(ir.id, ir);
  registerView('port-demultiplex-stage', portDemultiplexStageView);
  registerFacets([portDemultiplexFacet]);
}

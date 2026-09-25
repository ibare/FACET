import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { congestionControlAlgorithm, type CongestionControlData } from './algorithm.js';
import { congestionControlProjector } from './projector.js';
import { congestionControlIRs } from './irs.js';
import { congestionControlStageView } from './congestion-control-stage.js';
import { congestionControlFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './congestion-control-stage.js';
export * from './facet.js';

/** 흐름 제어와 혼잡 제어 facet 을 등록한다. 손잡이가 있어 reactive 로 돈다 */
export function registerCongestionControl(): void {
  registerAlgorithm<CongestionControlData>('congestionControl', congestionControlAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('congestionControlProjector', congestionControlProjector);
  for (const ir of congestionControlIRs) registerIR(ir.id, ir);
  registerView('congestion-control-stage', congestionControlStageView);
  registerFacets([congestionControlFacet]);
}

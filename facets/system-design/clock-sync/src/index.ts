/**
 * clock-sync — 등록 진입점. 손잡이가 있어 reactive 로 등록한다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { clockSyncAlgorithm, type ClockSyncData } from './algorithm.js';
import { clockSyncProjector } from './projector.js';
import { clockSyncIRs } from './irs.js';
import { clockSyncStageView } from './clock-sync-stage.js';
import { clockSyncFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './clock-sync-stage.js';
export * from './facet.js';

export function registerClockSync(): void {
  registerAlgorithm<ClockSyncData>('clockSync', clockSyncAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('clockSyncProjector', clockSyncProjector);
  for (const ir of clockSyncIRs) registerIR(ir.id, ir);
  registerView('clock-sync-stage', clockSyncStageView);
  registerFacets([clockSyncFacet]);
}

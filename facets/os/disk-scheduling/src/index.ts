import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { diskSchedulingAlgorithm, type DiskSchedulingData } from './algorithm.js';
import { diskSchedulingProjector } from './projector.js';
import { diskSchedulingIRs } from './irs.js';
import { diskSchedulingStageView } from './disk-scheduling-stage.js';
import { diskSchedulingFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './disk-scheduling-stage.js';
export * from './facet.js';

export function registerDiskScheduling(): void {
  registerAlgorithm<DiskSchedulingData>('diskScheduling', diskSchedulingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('diskSchedulingProjector', diskSchedulingProjector);
  for (const ir of diskSchedulingIRs) registerIR(ir.id, ir);
  registerView('disk-scheduling-stage', diskSchedulingStageView);
  registerFacets([diskSchedulingFacet]);
}

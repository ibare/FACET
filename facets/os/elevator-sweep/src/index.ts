import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { elevatorSweep, type ElevatorSweepFacetData } from './algorithm.js';
import { elevatorSweepScene } from './scene.js';
import { elevatorSweepIRs } from './irs.js';
import { elevatorSweepStageView } from './elevator-sweep-stage.js';
import { elevatorSweepFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './elevator-sweep-stage.js';
export * from './facet.js';

export function registerElevatorSweep(): void {
  registerAlgorithm<ElevatorSweepFacetData>('elevatorSweep', elevatorSweep, { mechanismKind: 'reactive' });
  registerScenePlan('elevatorSweepScene', elevatorSweepScene);
  for (const ir of elevatorSweepIRs) registerIR(ir.id, ir);
  registerView('elevator-sweep-stage', elevatorSweepStageView);
  registerFacets([elevatorSweepFacet]);
}

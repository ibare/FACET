import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { waitAndSignal, type WaitAndSignalFacetData } from './algorithm.js';
import { waitAndSignalScene } from './scene.js';
import { waitAndSignalStageView } from './wait-and-signal-stage.js';
import { waitAndSignalIRs } from './irs.js';
import { waitAndSignalFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './wait-and-signal-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerWaitAndSignal(): void {
  registerAlgorithm<WaitAndSignalFacetData>('waitAndSignal', waitAndSignal, { mechanismKind: 'reactive' });
  registerScenePlan('waitAndSignalScene', waitAndSignalScene);
  for (const ir of waitAndSignalIRs) registerIR(ir.id, ir);
  registerView('wait-and-signal-stage', waitAndSignalStageView);
  registerFacets([waitAndSignalFacet]);
}

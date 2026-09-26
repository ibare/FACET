import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { reactiveUpdatesAlgorithm, type ReactiveUpdatesData } from './algorithm.js';
import { reactiveUpdatesProjector } from './projector.js';
import { reactiveUpdatesIRs } from './irs.js';
import { reactiveUpdatesStageView } from './reactive-updates-stage.js';
import { reactiveUpdatesFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './reactive-updates-stage.js';
export * from './facet.js';

export function registerReactiveUpdates(): void {
  registerAlgorithm<ReactiveUpdatesData>('reactiveUpdates', reactiveUpdatesAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('reactiveUpdatesProjector', reactiveUpdatesProjector);
  for (const ir of reactiveUpdatesIRs) registerIR(ir.id, ir);
  registerView('reactive-updates-stage', reactiveUpdatesStageView);
  registerFacets([reactiveUpdatesFacet]);
}

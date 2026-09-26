import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { shaAlgorithm, type ShaData } from './algorithm.js';
import { shaProjector } from './projector.js';
import { shaIRs } from './irs.js';
import { shaStageView } from './sha-stage.js';
import { shaFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './sha-stage.js';
export * from './facet.js';

export function registerSha(): void {
  registerAlgorithm<ShaData>('sha', shaAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('shaProjector', shaProjector);
  for (const ir of shaIRs) registerIR(ir.id, ir);
  registerView('sha-stage', shaStageView);
  registerFacets([shaFacet]);
}

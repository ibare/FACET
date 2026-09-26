import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { ganAlgorithm, type GanData } from './algorithm.js';
import { ganProjector } from './projector.js';
import { ganIRs } from './irs.js';
import { ganStageView } from './gan-stage.js';
import { ganFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './gan-stage.js';
export * from './facet.js';

/** gan facet 을 등록한다. 손잡이(start)가 있어 reactive 다. */
export function registerGan(): void {
  registerAlgorithm<GanData>('gan', ganAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('ganProjector', ganProjector);
  for (const ir of ganIRs) registerIR(ir.id, ir);
  registerView('gan-stage', ganStageView);
  registerFacets([ganFacet]);
}

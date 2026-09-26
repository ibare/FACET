import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { adamAlgorithm, type AdamData } from './algorithm.js';
import { adamProjector } from './projector.js';
import { adamIRs } from './irs.js';
import { adamStageView } from './adam-stage.js';
import { adamFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './adam-stage.js';
export * from './facet.js';

/** adam 을 레지스트리에 올린다. 손잡이가 있어 reactive 로 등록한다. */
export function registerAdam(): void {
  registerAlgorithm<AdamData>('adam', adamAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('adamProjector', adamProjector);
  for (const ir of adamIRs) registerIR(ir.id, ir);
  registerView('adam-stage', adamStageView);
  registerFacets([adamFacet]);
}

/**
 * dropout — 등록. 손잡이(쉴 확률 p · 되살림)가 있으니 reactive 로 등록한다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { dropoutAlgorithm, type DropoutData } from './algorithm.js';
import { dropoutProjector } from './projector.js';
import { dropoutIRs } from './irs.js';
import { dropoutStageView } from './dropout-stage.js';
import { dropoutFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './dropout-stage.js';
export * from './facet.js';

export function registerDropout(): void {
  registerAlgorithm<DropoutData>('dropout', dropoutAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('dropoutProjector', dropoutProjector);
  for (const ir of dropoutIRs) registerIR(ir.id, ir);
  registerView('dropout-stage', dropoutStageView);
  registerFacets([dropoutFacet]);
}

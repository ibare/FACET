/**
 * dense-neighborhood 등록 진입점.
 *
 * `registerDenseNeighborhood()` 를 여기서 부르지 않는다 — 호출 책임은 호스트에
 * 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { denseNeighborhoodAlgorithm } from './algorithm.js';
import { denseNeighborhoodStageView } from './dense-neighborhood-stage.js';
import { denseNeighborhoodDescription } from './description.js';
import { denseNeighborhoodFacet } from './facet.js';
import { denseNeighborhoodIRs } from './irs.js';
import { denseNeighborhoodProjector } from './projector.js';

export { denseNeighborhoodAlgorithm } from './algorithm.js';
export type { DenseNeighborhoodData, DenseNeighborhoodPoint } from './algorithm.js';
export { denseNeighborhoodStageView } from './dense-neighborhood-stage.js';
export { denseNeighborhoodDescription } from './description.js';
export { denseNeighborhoodFacet } from './facet.js';
export { denseNeighborhoodIRs } from './irs.js';
export { denseNeighborhoodProjector } from './projector.js';

export function registerDenseNeighborhood(): void {
  registerAlgorithm('denseNeighborhood', denseNeighborhoodAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('denseNeighborhoodProjector', denseNeighborhoodProjector);
  for (const ir of denseNeighborhoodIRs) registerIR(ir.id, ir);
  registerView('dense-neighborhood-stage', denseNeighborhoodStageView);
  registerFacets([denseNeighborhoodFacet]);
  registerDescription(denseNeighborhoodFacet.id, denseNeighborhoodDescription);
}

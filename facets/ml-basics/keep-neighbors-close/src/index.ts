/**
 * keepNeighborsClose 등록 진입점. 부르는 것은 호스트의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { keepNeighborsCloseAlgorithm } from './algorithm.js';
import { keepNeighborsCloseDescription } from './description.js';
import { keepNeighborsCloseFacet } from './facet.js';
import { keepNeighborsCloseIRs } from './irs.js';
import { keepNeighborsCloseStageView } from './keep-neighbors-close-stage.js';
import { keepNeighborsCloseProjector } from './projector.js';

export { keepNeighborsCloseAlgorithm } from './algorithm.js';
export type { KeepNeighborsCloseData, KeepNeighborsClosePoint } from './algorithm.js';
export { keepNeighborsCloseDescription } from './description.js';
export { keepNeighborsCloseFacet } from './facet.js';
export { keepNeighborsCloseIRs } from './irs.js';
export { keepNeighborsCloseStageView, readKeepNeighborsCloseScene } from './keep-neighbors-close-stage.js';
export type { KeepNeighborsCloseScene } from './keep-neighbors-close-stage.js';
export { keepNeighborsCloseProjector } from './projector.js';

export function registerKeepNeighborsClose(): void {
  registerAlgorithm('keepNeighborsClose', keepNeighborsCloseAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('keepNeighborsCloseProjector', keepNeighborsCloseProjector);
  for (const ir of keepNeighborsCloseIRs) registerIR(ir.id, ir);
  registerView('keep-neighbors-close-stage', keepNeighborsCloseStageView);
  registerFacets([keepNeighborsCloseFacet]);
  registerDescription(keepNeighborsCloseFacet.id, keepNeighborsCloseDescription);
}

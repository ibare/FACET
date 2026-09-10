/**
 * 등록 진입점. 호출은 호스트가 한다 — 여기서 부수효과로 부르지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { directionOfMostSpreadAlgorithm } from './algorithm.js';
import { directionOfMostSpreadDescription } from './description.js';
import { directionOfMostSpreadFacet } from './facet.js';
import { directionOfMostSpreadIRs } from './irs.js';
import { directionOfMostSpreadProjector } from './projector.js';
import { directionOfMostSpreadStageView } from './direction-of-most-spread-stage.js';

export { directionOfMostSpreadAlgorithm, type DirectionOfMostSpreadData } from './algorithm.js';
export { directionOfMostSpreadProjector } from './projector.js';
export { directionOfMostSpreadIRs } from './irs.js';
export { directionOfMostSpreadFacet } from './facet.js';
export { directionOfMostSpreadDescription } from './description.js';
export { directionOfMostSpreadStageView } from './direction-of-most-spread-stage.js';

export function registerDirectionOfMostSpread(): void {
  registerAlgorithm('directionOfMostSpread', directionOfMostSpreadAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('directionOfMostSpreadProjector', directionOfMostSpreadProjector);
  for (const ir of directionOfMostSpreadIRs) registerIR(ir.id, ir);
  registerView('direction-of-most-spread-stage', directionOfMostSpreadStageView);
  registerFacets([directionOfMostSpreadFacet]);
  registerDescription(directionOfMostSpreadFacet.id, directionOfMostSpreadDescription);
}

/**
 * count-then-place 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다. 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { countThenPlaceAlgorithm } from './algorithm.js';
import { countThenPlaceProjector } from './projector.js';
import { countThenPlaceIRs } from './irs.js';
import { countThenPlaceStageView } from './count-then-place-stage.js';
import { countThenPlaceFacet } from './facet.js';
import { countThenPlaceDescription } from './description.js';

export type { CountThenPlaceData } from './algorithm.js';
export {
  countThenPlaceAlgorithm,
  countThenPlaceProjector,
  countThenPlaceIRs,
  countThenPlaceStageView,
  countThenPlaceFacet,
  countThenPlaceDescription,
};

export function registerCountThenPlace(): void {
  registerAlgorithm('countThenPlace', countThenPlaceAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('countThenPlaceProjector', countThenPlaceProjector);
  for (const ir of countThenPlaceIRs) registerIR(ir.id, ir);
  registerView('count-then-place-stage', countThenPlaceStageView);
  registerFacets([countThenPlaceFacet]);
  registerDescription(countThenPlaceFacet.id, countThenPlaceDescription);
}

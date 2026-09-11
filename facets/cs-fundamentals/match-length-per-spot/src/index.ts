/**
 * matchLengthPerSpot 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { matchLengthPerSpotAlgorithm, type MatchLengthPerSpotData } from './algorithm.js';
import { matchLengthPerSpotProjector } from './projector.js';
import { matchLengthPerSpotIRs } from './irs.js';
import { matchLengthPerSpotStageView } from './match-length-per-spot-stage.js';
import { matchLengthPerSpotFacet } from './facet.js';
import { matchLengthPerSpotDescription } from './description.js';

export {
  matchLengthPerSpotAlgorithm,
  matchLengthPerSpotProjector,
  matchLengthPerSpotIRs,
  matchLengthPerSpotStageView,
  matchLengthPerSpotFacet,
  matchLengthPerSpotDescription,
};
export type { MatchLengthPerSpotData };

export function registerMatchLengthPerSpot(): void {
  registerAlgorithm<MatchLengthPerSpotData>(
    'matchLengthPerSpot',
    matchLengthPerSpotAlgorithm,
    { mechanismKind: 'reactive' },
  );
  registerProjector('matchLengthPerSpotProjector', matchLengthPerSpotProjector);
  for (const ir of matchLengthPerSpotIRs) registerIR(ir.id, ir);
  registerView('match-length-per-spot-stage', matchLengthPerSpotStageView);
  registerFacets([matchLengthPerSpotFacet]);
  registerDescription(matchLengthPerSpotFacet.id, matchLengthPerSpotDescription);
}

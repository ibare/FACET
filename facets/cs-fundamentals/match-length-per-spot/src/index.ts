/**
 * matchLengthPerSpot 조각의 등록 진입점.
 *
 * 화면은 장면(Scene) 방식이다 — 이벤트가 `MatchLengthPerSpotScene` 으로 쌓이고
 * stage 의 `render` 하나가 그 장면을 통째로 세운다. projector 는 없다 (S-scene).
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { matchLengthPerSpotAlgorithm, type MatchLengthPerSpotData } from './algorithm.js';
import { matchLengthPerSpotScene } from './scene.js';
import { matchLengthPerSpotIRs } from './irs.js';
import { matchLengthPerSpotStageView } from './match-length-per-spot-stage.js';
import { matchLengthPerSpotFacet } from './facet.js';
import { matchLengthPerSpotDescription } from './description.js';

export {
  matchLengthPerSpotAlgorithm,
  matchLengthPerSpotScene,
  matchLengthPerSpotIRs,
  matchLengthPerSpotStageView,
  matchLengthPerSpotFacet,
  matchLengthPerSpotDescription,
};
export type { MatchLengthPerSpotData };
export type {
  Borrow,
  MatchLengthPerSpotScene,
  MatchLengthStep,
  ScanTrace,
  Spot,
  WindowSpan,
} from './scene.js';

export function registerMatchLengthPerSpot(): void {
  registerAlgorithm<MatchLengthPerSpotData>(
    'matchLengthPerSpot',
    matchLengthPerSpotAlgorithm,
    { mechanismKind: 'reactive' },
  );
  registerScenePlan('matchLengthPerSpotScene', matchLengthPerSpotScene);
  for (const ir of matchLengthPerSpotIRs) registerIR(ir.id, ir);
  registerView('match-length-per-spot-stage', matchLengthPerSpotStageView);
  registerFacets([matchLengthPerSpotFacet]);
  registerDescription(matchLengthPerSpotFacet.id, matchLengthPerSpotDescription);
}

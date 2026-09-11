/**
 * match-from-back 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { matchFromBackAlgorithm, type MatchFromBackData } from './algorithm.js';
import { matchFromBackProjector } from './projector.js';
import { matchFromBackIRs } from './irs.js';
import { matchFromBackStageView } from './match-from-back-stage.js';
import { matchFromBackFacet } from './facet.js';
import { matchFromBackDescription } from './description.js';

export { matchFromBackAlgorithm, type MatchFromBackData };
export { matchFromBackProjector };
export { matchFromBackIRs };
export { matchFromBackStageView };
export { matchFromBackFacet };
export { matchFromBackDescription };

export function registerMatchFromBack(): void {
  registerAlgorithm('matchFromBack', matchFromBackAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('matchFromBackProjector', matchFromBackProjector);
  for (const ir of matchFromBackIRs) registerIR(ir.id, ir);
  registerView('match-from-back-stage', matchFromBackStageView);
  registerFacets([matchFromBackFacet]);
  registerDescription(matchFromBackFacet.id, matchFromBackDescription);
}

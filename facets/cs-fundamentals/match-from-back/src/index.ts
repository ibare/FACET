/**
 * match-from-back 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { matchFromBackAlgorithm, type MatchFromBackData } from './algorithm.js';
import { matchFromBackScene } from './scene.js';
import { matchFromBackIRs } from './irs.js';
import { matchFromBackStageView } from './match-from-back-stage.js';
import { matchFromBackFacet } from './facet.js';

export { matchFromBackAlgorithm, type MatchFromBackData };
export { matchFromBackScene, type MatchFromBackScene } from './scene.js';
export { matchFromBackIRs };
export { matchFromBackStageView };
export { matchFromBackFacet };

export function registerMatchFromBack(): void {
  registerAlgorithm('matchFromBack', matchFromBackAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('matchFromBackScene', matchFromBackScene);
  for (const ir of matchFromBackIRs) registerIR(ir.id, ir);
  registerView('match-from-back-stage', matchFromBackStageView);
  registerFacets([matchFromBackFacet]);
}

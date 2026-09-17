/**
 * squash-to-probability 등록 진입점.
 *
 * 부르는 것은 호스트다 — 이 파일은 사이드 이펙트로 스스로 등록하지 않는다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { squashToProbabilityAlgorithm, type SquashToProbabilityData } from './algorithm.js';
import { squashToProbabilityDescription } from './description.js';
import { squashToProbabilityFacet } from './facet.js';
import { squashToProbabilityIRs } from './irs.js';
import { squashToProbabilityScene } from './scene.js';
import { squashToProbabilityStageView } from './squash-to-probability-stage.js';

export {
  squashToProbabilityAlgorithm,
  squashOrder,
  squashScoresOf,
  type SquashToProbabilityData,
} from './algorithm.js';
export { squashToProbabilityDescription } from './description.js';
export { squashToProbabilityFacet } from './facet.js';
export { squashToProbabilityIRs } from './irs.js';
export {
  squashToProbabilityScene,
  type LandedScore,
  type Reading,
  type SquashCaption,
  type SquashStep,
  type SquashToProbabilityScene,
} from './scene.js';
export { squashToProbabilityStageView } from './squash-to-probability-stage.js';

export function registerSquashToProbability(): void {
  registerAlgorithm<SquashToProbabilityData>('squashToProbability', squashToProbabilityAlgorithm, {
    mechanismKind: 'reactive',
  });
  // 장면 이름은 algorithm 과 겹치지 않는다 — `module:` 참조가 어느 쪽인지
  // 말하지 못하게 된다 (C4, packages/core/test/register-names.test.ts).
  registerScenePlan('squashToProbabilityScene', squashToProbabilityScene);
  for (const ir of squashToProbabilityIRs) registerIR(ir.id, ir);
  registerView('squash-to-probability-stage', squashToProbabilityStageView);
  registerFacets([squashToProbabilityFacet]);
  registerDescription(squashToProbabilityFacet.id, squashToProbabilityDescription);
}

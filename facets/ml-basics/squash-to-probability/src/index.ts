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
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { squashToProbabilityAlgorithm, type SquashToProbabilityData } from './algorithm.js';
import { squashToProbabilityProjector } from './projector.js';
import { squashToProbabilityIRs } from './irs.js';
import { squashToProbabilityStageView } from './squash-to-probability-stage.js';
import { squashToProbabilityFacet } from './facet.js';
import { squashToProbabilityDescription } from './description.js';

export { squashToProbabilityAlgorithm, type SquashToProbabilityData } from './algorithm.js';
export { squashToProbabilityProjector } from './projector.js';
export { squashToProbabilityIRs } from './irs.js';
export { squashToProbabilityStageView, type SquashStep } from './squash-to-probability-stage.js';
export { squashToProbabilityFacet } from './facet.js';
export { squashToProbabilityDescription } from './description.js';

export function registerSquashToProbability(): void {
  registerAlgorithm<SquashToProbabilityData>('squashToProbability', squashToProbabilityAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('squashToProbabilityProjector', squashToProbabilityProjector);
  for (const ir of squashToProbabilityIRs) registerIR(ir.id, ir);
  registerView('squash-to-probability-stage', squashToProbabilityStageView);
  registerFacets([squashToProbabilityFacet]);
  registerDescription(squashToProbabilityFacet.id, squashToProbabilityDescription);
}

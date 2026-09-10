/**
 * k-must-be-given 등록 진입점.
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

import { kMustBeGivenAlgorithm } from './algorithm.js';
import { kMustBeGivenDescription } from './description.js';
import { kMustBeGivenFacet } from './facet.js';
import { kMustBeGivenIRs } from './irs.js';
import { kMustBeGivenProjector } from './projector.js';
import { kMustBeGivenStageView } from './k-must-be-given-stage.js';

export { kMustBeGivenAlgorithm, runKMeans } from './algorithm.js';
export type { KMustBeGivenData, KMeansRun } from './algorithm.js';
export { kMustBeGivenProjector } from './projector.js';
export { kMustBeGivenIRs } from './irs.js';
export { kMustBeGivenFacet } from './facet.js';
export { kMustBeGivenDescription } from './description.js';
export { kMustBeGivenStageView } from './k-must-be-given-stage.js';
export type { KMustBeGivenStage, SettleStep } from './k-must-be-given-stage.js';

export function registerKMustBeGiven(): void {
  registerAlgorithm('kMustBeGiven', kMustBeGivenAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('kMustBeGivenProjector', kMustBeGivenProjector);
  for (const ir of kMustBeGivenIRs) registerIR(ir.id, ir);
  registerView('k-must-be-given-stage', kMustBeGivenStageView);
  registerFacets([kMustBeGivenFacet]);
  registerDescription(kMustBeGivenFacet.id, kMustBeGivenDescription);
}

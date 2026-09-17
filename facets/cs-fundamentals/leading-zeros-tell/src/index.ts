/**
 * leading-zeros-tell 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 부르는 책임은 호스트 앱에 있다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { leadingZerosTellAlgorithm } from './algorithm.js';
import { leadingZerosTellScene } from './scene.js';
import { leadingZerosTellIRs } from './irs.js';
import { leadingZerosTellStageView } from './leading-zeros-tell-stage.js';
import { leadingZerosTellFacet } from './facet.js';
import { leadingZerosTellDescription } from './description.js';

export {
  leadingZerosTellAlgorithm,
  type LeadingZerosTellData,
  type LeadingZerosTellKey,
} from './algorithm.js';
export {
  leadingZerosTellScene,
  type LeadingZerosTellScene,
  type LeadingZerosTellStep,
} from './scene.js';
export { leadingZerosTellIRs } from './irs.js';
export { leadingZerosTellStageView } from './leading-zeros-tell-stage.js';
export { leadingZerosTellFacet } from './facet.js';
export { leadingZerosTellDescription } from './description.js';

export function registerLeadingZerosTell(): void {
  registerAlgorithm('leadingZerosTell', leadingZerosTellAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('leadingZerosTellScene', leadingZerosTellScene);
  for (const ir of leadingZerosTellIRs) registerIR(ir.id, ir);
  registerView('leading-zeros-tell-stage', leadingZerosTellStageView);
  registerFacets([leadingZerosTellFacet]);
  registerDescription(leadingZerosTellFacet.id, leadingZerosTellDescription);
}

/**
 * gap-shrink 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { gapShrinkAlgorithm, countGapRun } from './algorithm.js';
import type { GapRunTally, GapShrinkData } from './algorithm.js';
import { gapShrinkScene } from './scene.js';
import { gapShrinkIRs } from './irs.js';
import { gapShrinkStageView } from './gap-shrink-stage.js';
import { gapShrinkFacet } from './facet.js';
import { gapShrinkDescription } from './description.js';

export {
  gapShrinkAlgorithm,
  countGapRun,
  gapShrinkScene,
  gapShrinkIRs,
  gapShrinkStageView,
  gapShrinkFacet,
  gapShrinkDescription,
};
export type { GapRunTally, GapShrinkData };

export function registerGapShrink(): void {
  registerAlgorithm<GapShrinkData>('gapShrink', gapShrinkAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('gapShrinkScene', gapShrinkScene);
  for (const ir of gapShrinkIRs) registerIR(ir.id, ir);
  registerView('gap-shrink-stage', gapShrinkStageView);
  registerFacets([gapShrinkFacet]);
  registerDescription(gapShrinkFacet.id, gapShrinkDescription);
}

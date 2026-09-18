/**
 * draft-then-verify 조각 — 작은 모형이 앞서 쓴 초안을 큰 모형이 한 번에 확인한다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { draftThenVerify, type DraftThenVerifyFacetData } from './algorithm.js';
import { draftThenVerifyScene } from './scene.js';
import { draftThenVerifyIRs } from './irs.js';
import { draftThenVerifyStageView } from './draft-then-verify-stage.js';
import { draftThenVerifyFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './draft-then-verify-stage.js';
export * from './facet.js';

export function registerDraftThenVerify(): void {
  registerAlgorithm<DraftThenVerifyFacetData>('draftThenVerify', draftThenVerify, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('draftThenVerifyScene', draftThenVerifyScene);
  for (const ir of draftThenVerifyIRs) registerIR(ir.id, ir);
  registerView('draft-then-verify-stage', draftThenVerifyStageView);
  registerFacets([draftThenVerifyFacet]);
}

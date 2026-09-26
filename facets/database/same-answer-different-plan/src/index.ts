import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sameAnswerDifferentPlan, type SameAnswerDifferentPlanFacetData } from './algorithm.js';
import { sameAnswerDifferentPlanScene } from './scene.js';
import { sameAnswerDifferentPlanIRs } from './irs.js';
import { sameAnswerDifferentPlanStageView } from './same-answer-different-plan-stage.js';
import { sameAnswerDifferentPlanFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './same-answer-different-plan-stage.js';
export * from './facet.js';

export function registerSameAnswerDifferentPlan(): void {
  registerAlgorithm<SameAnswerDifferentPlanFacetData>('sameAnswerDifferentPlan', sameAnswerDifferentPlan, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sameAnswerDifferentPlanScene', sameAnswerDifferentPlanScene);
  for (const ir of sameAnswerDifferentPlanIRs) registerIR(ir.id, ir);
  registerView('same-answer-different-plan-stage', sameAnswerDifferentPlanStageView);
  registerFacets([sameAnswerDifferentPlanFacet]);
}

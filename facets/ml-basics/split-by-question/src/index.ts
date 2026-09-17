/**
 * splitByQuestion 등록 진입점.
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

import { splitByQuestionAlgorithm, type SplitByQuestionData } from './algorithm.js';
import { splitByQuestionFacet } from './facet.js';
import { splitByQuestionIRs } from './irs.js';
import { splitByQuestionScene } from './scene.js';
import { splitByQuestionStageView } from './split-by-question-stage.js';

export { splitByQuestionAlgorithm, oneLabelOnly, tally } from './algorithm.js';
export type { SplitByQuestionData, SplitPoint, SideTally } from './algorithm.js';
export { splitByQuestionScene } from './scene.js';
export type {
  SplitAxis,
  SplitByQuestionScene,
  SplitCaption,
  SplitStep,
  TriedCut,
} from './scene.js';
export { splitByQuestionIRs } from './irs.js';
export { splitByQuestionFacet } from './facet.js';
export { splitByQuestionStageView } from './split-by-question-stage.js';

export function registerSplitByQuestion(): void {
  registerAlgorithm<SplitByQuestionData>('splitByQuestion', splitByQuestionAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('splitByQuestionScene', splitByQuestionScene);
  for (const ir of splitByQuestionIRs) registerIR(ir.id, ir);
  registerView('split-by-question-stage', splitByQuestionStageView);
  registerFacets([splitByQuestionFacet]);
}

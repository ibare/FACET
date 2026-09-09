/**
 * splitByQuestion 등록 진입점.
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

import { splitByQuestionAlgorithm, type SplitByQuestionData } from './algorithm.js';
import { splitByQuestionDescription } from './description.js';
import { splitByQuestionFacet } from './facet.js';
import { splitByQuestionIRs } from './irs.js';
import { splitByQuestionProjector } from './projector.js';
import { splitByQuestionStageView } from './split-by-question-stage.js';

export { splitByQuestionAlgorithm } from './algorithm.js';
export type { SplitByQuestionData, SplitPoint, SideTally } from './algorithm.js';
export { splitByQuestionProjector } from './projector.js';
export { splitByQuestionIRs } from './irs.js';
export { splitByQuestionFacet } from './facet.js';
export { splitByQuestionDescription } from './description.js';
export { splitByQuestionStageView } from './split-by-question-stage.js';

export function registerSplitByQuestion(): void {
  registerAlgorithm<SplitByQuestionData>('splitByQuestion', splitByQuestionAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('splitByQuestionProjector', splitByQuestionProjector);
  for (const ir of splitByQuestionIRs) registerIR(ir.id, ir);
  registerView('split-by-question-stage', splitByQuestionStageView);
  registerFacets([splitByQuestionFacet]);
  registerDescription(splitByQuestionFacet.id, splitByQuestionDescription);
}

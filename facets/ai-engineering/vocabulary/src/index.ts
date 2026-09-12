/**
 * @ffacet/algorithm-vocabulary — 어휘 사전 완제품 번들.
 *
 * reactive. 마운트 직후 흔한 말 어휘로 시험 낱말 여섯을 한 번 자르고, 그 뒤로는
 * 말뭉치 손잡이(everyday · biology · code)를 기다린다. 손잡이를 옮기면 그 말뭉치로
 * 다시 학습해 같은 낱말을 다시 자르고, 자르는 자리가 실제로 옮겨 간다.
 *
 * 코드 패널은 두지 않는다 — `irs.ts` 머리말에 그 까닭이 있다.
 */

export {
  vocabulary,
  trainMerges,
  segmentWord,
  vocabularyOf,
  type MergeRule,
  type VocabularyCorpus,
  type VocabularyData,
} from './algorithm.js';
export { vocabularyProjector } from './projector.js';
export { vocabularyIRs } from './irs.js';
export { vocabularyFacet } from './facet.js';
export { vocabularyDescription } from './description.js';
export { vocabularyStageView } from './vocabulary-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { vocabulary, type VocabularyData } from './algorithm.js';
import { vocabularyProjector } from './projector.js';
import { vocabularyIRs } from './irs.js';
import { vocabularyFacet } from './facet.js';
import { vocabularyDescription } from './description.js';
import { vocabularyStageView } from './vocabulary-stage.js';

export function registerVocabulary(): void {
  // 손잡이가 붙은 화면이라 mechanismKind 가 'reactive' 여야 한다.
  // CoroutineMechanism 의 supportedControls 에는 '*' 가 없어, coroutine 으로 두면
  // 러너가 마운트 시점에 throw 한다 (S-runtime).
  registerAlgorithm<VocabularyData>('vocabulary', vocabulary, { mechanismKind: 'reactive' });
  registerProjector('vocabularyProjector', vocabularyProjector);
  for (const ir of vocabularyIRs) registerIR(ir.id, ir);
  registerView('vocabulary-stage', vocabularyStageView);
  registerFacets([vocabularyFacet]);
  registerDescription(vocabularyFacet.id, vocabularyDescription);
}

/**
 * between-letter-and-word — 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다. 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { betweenLetterAndWordAlgorithm } from './algorithm.js';
import { betweenLetterAndWordScene } from './scene.js';
import { betweenLetterAndWordIRs } from './irs.js';
import { betweenLetterAndWordStageView } from './between-letter-and-word-stage.js';
import { betweenLetterAndWordFacet } from './facet.js';
import { betweenLetterAndWordDescription } from './description.js';

export {
  betweenLetterAndWordAlgorithm,
  betweenLetterAndWordScene,
  betweenLetterAndWordIRs,
  betweenLetterAndWordStageView,
  betweenLetterAndWordFacet,
  betweenLetterAndWordDescription,
};
export {
  computeSegmentations,
  segmentWord,
  trainMerges,
} from './algorithm.js';
export type {
  BetweenLetterAndWordData,
  CorpusEntry,
  Segmentations,
} from './algorithm.js';

export function registerBetweenLetterAndWord(): void {
  // 조각은 reactive 로 돈다 — mount 하면 스스로 시작하고 걸음 간격을 스스로
  // 정한다 (S-piece). 그 선언은 facet.ts 가 아니라 이 자리다.
  registerAlgorithm('betweenLetterAndWord', betweenLetterAndWordAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('betweenLetterAndWordScene', betweenLetterAndWordScene);
  for (const ir of betweenLetterAndWordIRs) registerIR(ir.id, ir);
  registerView('between-letter-and-word-stage', betweenLetterAndWordStageView);
  registerFacets([betweenLetterAndWordFacet]);
  registerDescription(betweenLetterAndWordFacet.id, betweenLetterAndWordDescription);
}

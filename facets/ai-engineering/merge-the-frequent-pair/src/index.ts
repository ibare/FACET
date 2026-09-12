/**
 * mergeTheFrequentPair 등록 진입점.
 *
 * 호출 책임은 호스트 앱에 있다 — 이 파일은 사이드 이펙트로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { mergeTheFrequentPairAlgorithm, type MergeTheFrequentPairData } from './algorithm.js';
import { mergeTheFrequentPairProjector } from './projector.js';
import { mergeTheFrequentPairIRs } from './irs.js';
import { mergeTheFrequentPairStageView } from './merge-the-frequent-pair-stage.js';
import { mergeTheFrequentPairFacet } from './facet.js';
import { mergeTheFrequentPairDescription } from './description.js';

export function registerMergeTheFrequentPair(): void {
  // 조각은 마운트 시 스스로 시작하고 걸음 간격도 스스로 정해야 한다. 둘 다
  // reactive 만 준다 (S-piece).
  registerAlgorithm<MergeTheFrequentPairData>('mergeTheFrequentPair', mergeTheFrequentPairAlgorithm, {
    mechanismKind: 'reactive',
  });
  // projector 이름은 algorithm 과 겹치지 않게 둔다 (C4).
  registerProjector('mergeTheFrequentPairProjector', mergeTheFrequentPairProjector);
  for (const ir of mergeTheFrequentPairIRs) registerIR(ir.id, ir);
  registerView('merge-the-frequent-pair-stage', mergeTheFrequentPairStageView);
  registerFacets([mergeTheFrequentPairFacet]);
  registerDescription(mergeTheFrequentPairFacet.id, mergeTheFrequentPairDescription);
}

export { mergeTheFrequentPairAlgorithm } from './algorithm.js';
export type { MergeTheFrequentPairData } from './algorithm.js';
export { mergeTheFrequentPairProjector } from './projector.js';
export { mergeTheFrequentPairIRs } from './irs.js';
export { mergeTheFrequentPairStageView } from './merge-the-frequent-pair-stage.js';
export type { MergeTheFrequentPairStage } from './merge-the-frequent-pair-stage.js';
export { mergeTheFrequentPairFacet } from './facet.js';
export { mergeTheFrequentPairDescription } from './description.js';

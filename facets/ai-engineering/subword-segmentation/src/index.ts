/**
 * @ffacet/algorithm-subword-segmentation — 서브워드 분할 완제품 번들.
 *
 * reactive 다. 마운트 직후 병합 24 번으로 한 판 보이고, 그 뒤로는 손잡이
 * (0 · 12 · 24 · 36 · 44)를 기다린다. 손잡이를 옮기면 낱글자 줄로 돌아가 그 값의
 * 규칙 열로 다시 뭉친다.
 *
 * **`mechanismKind: 'reactive'` 를 선언하는 자리가 여기다.** `facet.ts` 에는 그런
 * 필드가 없다. coroutine 으로 두면 `supportedControls` 에 `'*'` 가 없어 손잡이가
 * 붙은 순간 러너가 마운트 시점에 throw 하고, 통과하더라도 `dispatch` 가 no-op 이라
 * 손잡이가 알고리즘에 닿지 않는다.
 *
 * 코드 패널은 두지 않는다 — `irs.ts` 머리말에 그 까닭이 있다.
 */

export {
  subwordSegmentation,
  computeSubwordRun,
  learnMerges,
  mergeAdjacent,
  openWord,
  segmentSentence,
  segmentWord,
  type CorpusEntry,
  type MergeFrame,
  type MergeRule,
  type SubwordRun,
  type SubwordSegmentationData,
} from './algorithm.js';
export { subwordSegmentationProjector } from './projector.js';
export { subwordSegmentationIRs } from './irs.js';
export { subwordSegmentationFacet } from './facet.js';
export {
  subwordSegmentationStageView,
  readSubwordScene,
  type SubwordMergeFrame,
  type SubwordScene,
} from './subword-segmentation-stage.js';

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { subwordSegmentation, type SubwordSegmentationData } from './algorithm.js';
import { subwordSegmentationProjector } from './projector.js';
import { subwordSegmentationIRs } from './irs.js';
import { subwordSegmentationFacet } from './facet.js';
import { subwordSegmentationStageView } from './subword-segmentation-stage.js';

export function registerSubwordSegmentation(): void {
  registerAlgorithm<SubwordSegmentationData>('subwordSegmentation', subwordSegmentation, {
    mechanismKind: 'reactive',
  });
  registerProjector('subwordSegmentationProjector', subwordSegmentationProjector);
  for (const ir of subwordSegmentationIRs) registerIR(ir.id, ir);
  registerView('subword-segmentation-stage', subwordSegmentationStageView);
  registerFacets([subwordSegmentationFacet]);
}

/**
 * @ffacet/algorithm-bpe-training — BPE 학습 완제품 번들.
 *
 * reactive. 마운트 직후 기본 빈도로 여섯 걸음을 돌아 보이고, 그 뒤로는 `sing` 의
 * 빈도 손잡이(2 · 5 · 8 · 12 · 18)를 기다린다. 손잡이를 옮기면 그 빈도로 처음부터
 * 다시 돌아, 짝들이 순위를 다투며 자리를 바꾸고 병합 차례가 재배열된다.
 *
 * **`mechanismKind: 'reactive'` 는 여기서 선언한다.** `CoroutineMechanism` 의
 * `supportedControls` 에 `'*'` 가 없어, 손잡이가 붙은 채로 coroutine 이 되면 러너가
 * 마운트 시점에 throw 한다.
 *
 * 코드 패널은 두지 않는다 — `irs.ts` 머리말에 그 까닭이 있다.
 */

export {
  bpeTraining,
  trainBpe,
  rankPairs,
  applyMerge,
  splitToSymbols,
  vocabSizeOf,
  type BpeTrainingData,
  type BpeWordSpec,
  type MergeRule,
  type PairCount,
  type TrainRun,
  type TrainStep,
  type WordSplit,
} from './algorithm.js';
export { bpeTrainingProjector } from './projector.js';
export { bpeTrainingIRs } from './irs.js';
export { bpeTrainingFacet } from './facet.js';
export {
  bpeTrainingStageView,
  rankKey,
  showToken,
  type StageRankRow,
  type StageRule,
  type StageWord,
} from './bpe-training-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { bpeTraining, type BpeTrainingData } from './algorithm.js';
import { bpeTrainingProjector } from './projector.js';
import { bpeTrainingIRs } from './irs.js';
import { bpeTrainingFacet } from './facet.js';
import { bpeTrainingStageView } from './bpe-training-stage.js';

export function registerBpeTraining(): void {
  registerAlgorithm<BpeTrainingData>('bpeTraining', bpeTraining, { mechanismKind: 'reactive' });
  registerProjector('bpeTrainingProjector', bpeTrainingProjector);
  for (const ir of bpeTrainingIRs) registerIR(ir.id, ir);
  registerView('bpe-training-stage', bpeTrainingStageView);
  registerFacets([bpeTrainingFacet]);
}

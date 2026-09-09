/**
 * @ffacet/algorithm-merge-sort — 머지 정렬 완결형 번들.
 *
 * 이 알고리즘의 산출물은 그림이 아니라 코드다. `irs.ts` 의 IR 하나가
 * transpiler 여섯을 통해 python · javascript · typescript · java · cpp ·
 * csharp 소스로 나오고, 각 문에 붙인 phase 가 재생과 맞물려 지금 실행 중인
 * 줄을 짚는다.
 */

export { mergeSort, type MergeSortData } from './algorithm.js';
export { mergeSortProjector } from './projector.js';
export { mergeSortRecursiveIR, mergeSortIRs } from './irs.js';
export { mergeSortFacet } from './facet.js';
export { mergeSortDescription } from './description.js';
export { mergeSortStageView, type MergeSortStage } from './merge-sort-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { mergeSort, type MergeSortData } from './algorithm.js';
import { mergeSortProjector } from './projector.js';
import { mergeSortIRs } from './irs.js';
import { mergeSortFacet } from './facet.js';
import { mergeSortDescription } from './description.js';
import { mergeSortStageView } from './merge-sort-stage.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerMergeSort(): void {
  registerAlgorithm<MergeSortData>('mergeSort', mergeSort);
  registerProjector('mergeSortProjector', mergeSortProjector);
  for (const ir of mergeSortIRs) registerIR(ir.id, ir);
  registerView('merge-sort-stage', mergeSortStageView);
  registerFacets([mergeSortFacet]);
  registerDescription(mergeSortFacet.id, mergeSortDescription);
}

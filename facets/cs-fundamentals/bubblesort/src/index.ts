/**
 * @facet/algorithm-bubblesort — 4-layer 알고리즘 모듈.
 *
 * 시각적 정체성을 드러내는 다중 뷰(stage + startPreview + goalPreview + passTracker + snapshotStrip)
 * 를 조율하는 projector 와 함께 동작.
 */

export { bubblesort, computeBubblesortResult, type BubbleSortData } from './algorithm.js';
export { bubblesortProjector } from './projector.js';
export { bubblesortImperativeIR, bubblesortIRs } from './irs.js';
export { bubblesortFacet } from './facet.js';
export { bubblesortDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { bubblesort, computeBubblesortResult, type BubbleSortData } from './algorithm.js';
import { bubblesortProjector } from './projector.js';
import { bubblesortIRs } from './irs.js';
import { bubblesortFacet } from './facet.js';
import { bubblesortDescription } from './description.js';

/** algorithm/projector/IR/facet/description 등록 헬퍼 (transpiler 는 호스트가 별도 등록). */
export function registerBubblesort(): void {
  registerAlgorithm<BubbleSortData>('bubblesort', bubblesort, {
    computeResult: computeBubblesortResult,
  });
  registerProjector('bubblesortProjector', bubblesortProjector);
  for (const ir of bubblesortIRs) registerIR(ir.id, ir);
  registerFacets([bubblesortFacet]);
  registerDescription(bubblesortFacet.id, bubblesortDescription);
}

/**
 * divideConquerCombine 등록 진입점.
 *
 * 사이드 이펙트로 자동 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { divideConquerCombineAlgorithm } from './algorithm.js';
import { divideConquerCombineProjector } from './projector.js';
import { divideConquerCombineIRs } from './irs.js';
import { divideConquerCombineStageView } from './divide-conquer-combine-stage.js';
import { divideConquerCombineFacet } from './facet.js';
import { divideConquerCombineDescription } from './description.js';

export { divideConquerCombineAlgorithm, computeDivideConquerCombinePlan } from './algorithm.js';
export type {
  DivideConquerCombineData,
  DcNode,
  DcSplitRecord,
  DcMergeRecord,
  DivideConquerPlan,
} from './algorithm.js';
export { divideConquerCombineProjector } from './projector.js';
export { divideConquerCombineIRs } from './irs.js';
export { divideConquerCombineStageView } from './divide-conquer-combine-stage.js';
export type { DcSplitSpec, DcMergeSpec } from './divide-conquer-combine-stage.js';
export { divideConquerCombineFacet } from './facet.js';
export { divideConquerCombineDescription } from './description.js';

export function registerDivideConquerCombine(): void {
  // reactive — 조각은 컨트롤바 없이 스스로 시작하고 걸음 간격도 스스로 정한다 (S-piece).
  registerAlgorithm('divideConquerCombine', divideConquerCombineAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('divideConquerCombineProjector', divideConquerCombineProjector);
  for (const ir of divideConquerCombineIRs) registerIR(ir.id, ir);
  registerView('divide-conquer-combine-stage', divideConquerCombineStageView);
  registerFacets([divideConquerCombineFacet]);
  registerDescription(divideConquerCombineFacet.id, divideConquerCombineDescription);
}

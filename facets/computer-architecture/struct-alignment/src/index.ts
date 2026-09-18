import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { structAlignmentAlgorithm } from './algorithm.js';
import { structAlignmentProjector } from './projector.js';
import { structAlignmentIRs } from './irs.js';
import { structAlignmentStageView } from './struct-alignment-stage.js';
import { structAlignmentFacet } from './facet.js';

export {
  structAlignmentAlgorithm,
  computeStructLayout,
  arrangeFields,
  ORDER_LARGEST_FIRST,
} from './algorithm.js';
export type { StructAlignmentData, StructField, StructLayout, PlacedField } from './algorithm.js';
export { structAlignmentProjector } from './projector.js';
export { structAlignmentImperativeIR, structAlignmentIRs } from './irs.js';
export { structAlignmentStageView } from './struct-alignment-stage.js';
export type { StructAlignmentStage } from './struct-alignment-stage.js';
export { structAlignmentFacet } from './facet.js';

/** 알고리즘 · projector · IR · stage · facet 을 이 순서로 등록한다. 호스트가 부른다. */
export function registerStructAlignment(): void {
  // 손잡이(segmented-slider)가 있으므로 reactive — coroutine 이면 위젯 액션이 없어 마운트에서 던진다.
  registerAlgorithm('structAlignment', structAlignmentAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('structAlignmentProjector', structAlignmentProjector);
  for (const ir of structAlignmentIRs) registerIR(ir.id, ir);
  registerView('struct-alignment-stage', structAlignmentStageView);
  registerFacets([structAlignmentFacet]);
}

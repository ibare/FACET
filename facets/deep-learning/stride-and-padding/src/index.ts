import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { strideAndPadding, type StrideAndPaddingFacetData } from './algorithm.js';
import { strideAndPaddingScene } from './scene.js';
import { strideAndPaddingStageView } from './stride-and-padding-stage.js';
import { strideAndPaddingIRs } from './irs.js';
import { strideAndPaddingFacet } from './facet.js';

export {
  strideAndPadding,
  narrowData,
  narrowGrid,
  cellAt,
  cellRowLength,
  outputSize,
  isPadCell,
  seatOf,
  type StrideAndPaddingFacetData,
} from './algorithm.js';
export {
  strideAndPaddingScene,
  type StrideAndPaddingScene,
  type StrideAndPaddingStep,
  type SeatMark,
} from './scene.js';
export { strideAndPaddingStageView } from './stride-and-padding-stage.js';
export { strideAndPaddingIRs } from './irs.js';
export { strideAndPaddingFacet } from './facet.js';

export function registerStrideAndPadding(): void {
  registerAlgorithm<StrideAndPaddingFacetData>('strideAndPadding', strideAndPadding, { mechanismKind: 'reactive' });
  registerScenePlan('strideAndPaddingScene', strideAndPaddingScene);
  for (const ir of strideAndPaddingIRs) registerIR(ir.id, ir);
  registerView('stride-and-padding-stage', strideAndPaddingStageView);
  registerFacets([strideAndPaddingFacet]);
}

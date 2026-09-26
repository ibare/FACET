import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { slidingWindowCount, type SlidingWindowCountFacetData } from './algorithm.js';
import { slidingWindowCountScene } from './scene.js';
import { slidingWindowCountIRs } from './irs.js';
import { slidingWindowCountStageView } from './sliding-window-count-stage.js';
import { slidingWindowCountFacet } from './facet.js';

export {
  slidingWindowCount,
  narrowSlidingWindowCountData,
  cellOf,
  cellBounds,
  windowBounds,
  axisEndOf,
  type SlidingWindowCountFacetData,
  type SlidingWindowRequest,
  type Verdict,
} from './algorithm.js';
export {
  slidingWindowCountScene,
  type SlidingWindowCountScene,
  type SlidingWindowCountStep,
  type FixedMark,
  type SlideMark,
} from './scene.js';
export { slidingWindowCountIRs } from './irs.js';
export { slidingWindowCountStageView } from './sliding-window-count-stage.js';
export { slidingWindowCountFacet } from './facet.js';

export function registerSlidingWindowCount(): void {
  registerAlgorithm<SlidingWindowCountFacetData>('slidingWindowCount', slidingWindowCount, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('slidingWindowCountScene', slidingWindowCountScene);
  for (const ir of slidingWindowCountIRs) registerIR(ir.id, ir);
  registerView('sliding-window-count-stage', slidingWindowCountStageView);
  registerFacets([slidingWindowCountFacet]);
}

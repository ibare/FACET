import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { prefetchingAlgorithm } from './algorithm.js';
import { prefetchingProjector } from './projector.js';
import { prefetchingIRs } from './irs.js';
import { prefetchingStageView } from './prefetching-stage.js';
import { prefetchingFacet } from './facet.js';

export {
  prefetchingAlgorithm,
  computePrefetchingResult,
  type PrefetchingData,
  type PrefetchingResult,
  type PrefetchStep,
  type PrefetchFetch,
} from './algorithm.js';
export { prefetchingProjector } from './projector.js';
export { prefetchingImperativeIR, prefetchingIRs } from './irs.js';
export { prefetchingStageView, type PrefetchingStage } from './prefetching-stage.js';
export { prefetchingFacet } from './facet.js';

export function registerPrefetching(): void {
  // 손잡이가 붙은 완제품이라 reactive 다 — coroutine 이면 위젯 액션이 알고리즘에 닿지 않는다.
  registerAlgorithm('prefetching', prefetchingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('prefetchingProjector', prefetchingProjector);
  for (const ir of prefetchingIRs) registerIR(ir.id, ir);
  registerView('prefetching-stage', prefetchingStageView);
  registerFacets([prefetchingFacet]);
}

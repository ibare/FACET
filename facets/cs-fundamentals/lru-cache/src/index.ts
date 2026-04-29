/**
 * @facet/algorithm-lru-cache — 4-layer LRU 캐시 facet 번들.
 *
 * 입력 반응형 (ReactiveMechanism). 자동 시연 (put k1·k2·k3 → get k1) 후
 * 사용자 입력 (get/put/reset) 을 1:1 시각 사건으로 매핑.
 *
 * algorithm / projector / facet JSON / description / 전용 view (lru-cache-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  lruCache,
  type LruCacheFacetData,
  type LruCacheInputEvent,
} from './algorithm.js';
export { lruCacheProjector } from './projector.js';
export { lruCacheIRs } from './irs.js';
export { lruCacheFacet } from './facet.js';
export { lruCacheDescription } from './description.js';
export { lruCacheStageView } from './lru-cache-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { lruCache, type LruCacheFacetData } from './algorithm.js';
import { lruCacheProjector } from './projector.js';
import { lruCacheIRs } from './irs.js';
import { lruCacheFacet } from './facet.js';
import { lruCacheDescription } from './description.js';
import { lruCacheStageView } from './lru-cache-stage.js';

export function registerLruCache(): void {
  registerAlgorithm<LruCacheFacetData>('lruCache', lruCache, {
    mechanismKind: 'reactive',
  });
  registerProjector('lruCacheProjector', lruCacheProjector);
  for (const ir of lruCacheIRs) registerIR(ir.id, ir);
  registerView('lru-cache-stage', lruCacheStageView);
  registerFacets([lruCacheFacet]);
  registerDescription(lruCacheFacet.id, lruCacheDescription);
}

/**
 * @ffacet/algorithm-direct-mapped-cache — 직접 사상 캐시 완제품.
 *
 * `register<Name>()` 를 여기서 자동으로 부르지 않는다. 부르는 책임은 호스트
 * 앱(playground / bootstrap) 에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { directMappedCacheAlgorithm, type DirectMappedCacheData } from './algorithm.js';
import { directMappedCacheProjector } from './projector.js';
import { directMappedCacheIRs } from './irs.js';
import { directMappedCacheStageView } from './direct-mapped-cache-stage.js';
import { directMappedCacheFacet } from './facet.js';

export {
  directMappedCacheAlgorithm,
  computeDirectMappedCacheTrace,
  type DirectMappedCacheData,
  type CacheAccess,
  type CacheOutcome,
  type CacheTrace,
} from './algorithm.js';
export { directMappedCacheProjector } from './projector.js';
export { directMappedCacheImperativeIR, directMappedCacheIRs } from './irs.js';
export { directMappedCacheStageView } from './direct-mapped-cache-stage.js';
export { directMappedCacheFacet } from './facet.js';

export function registerDirectMappedCache(): void {
  // 손잡이(segmented-slider)를 받으려면 reactive 여야 한다. coroutine 의
  // supportedControls 에는 '*' 가 없어 위젯 액션을 만나면 러너가 마운트 전에
  // throw 한다.
  registerAlgorithm<DirectMappedCacheData>('directMappedCache', directMappedCacheAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('directMappedCacheProjector', directMappedCacheProjector);
  for (const ir of directMappedCacheIRs) registerIR(ir.id, ir);
  registerView('direct-mapped-cache-stage', directMappedCacheStageView);
  registerFacets([directMappedCacheFacet]);
}

/**
 * LFU 캐시 완제품 — 세는 창 손잡이가 LFU 의 성격을 가른다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { lfuCacheAlgorithm, type LfuCacheData } from './algorithm.js';
import { lfuCacheProjector } from './projector.js';
import { lfuCacheIRs } from './irs.js';
import { lfuCacheStageView } from './lfu-cache-stage.js';
import { lfuCacheFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './lfu-cache-stage.js';
export * from './facet.js';

export function registerLfuCache(): void {
  registerAlgorithm<LfuCacheData>('lfuCache', lfuCacheAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('lfuCacheProjector', lfuCacheProjector);
  for (const ir of lfuCacheIRs) registerIR(ir.id, ir);
  registerView('lfu-cache-stage', lfuCacheStageView);
  registerFacets([lfuCacheFacet]);
}

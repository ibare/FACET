import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { kvCacheAlgorithm, type KvCacheData } from './algorithm.js';
import { kvCacheProjector } from './projector.js';
import { kvCacheIRs } from './irs.js';
import { kvCacheStageView } from './kv-cache-stage.js';
import { kvCacheFacet } from './facet.js';

export {
  kvCacheAlgorithm,
  countKvCache,
  savedPercent,
  splitWords,
  type KvCacheData,
  type KvCacheCount,
} from './algorithm.js';
export { kvCacheProjector } from './projector.js';
export { kvCacheImperativeIR, kvCacheIRs } from './irs.js';
export { kvCacheStageView, type KvCacheStage } from './kv-cache-stage.js';
export { kvCacheFacet } from './facet.js';

export function registerKvCache(): void {
  registerAlgorithm<KvCacheData>('kvCache', kvCacheAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('kvCacheProjector', kvCacheProjector);
  for (const ir of kvCacheIRs) registerIR(ir.id, ir);
  registerView('kv-cache-stage', kvCacheStageView);
  registerFacets([kvCacheFacet]);
}

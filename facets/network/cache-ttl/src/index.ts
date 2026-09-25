import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { cacheTtl, type CacheTtlFacetData } from './algorithm.js';
import { cacheTtlScene } from './scene.js';
import { cacheTtlStageView } from './cache-ttl-stage.js';
import { cacheTtlIRs } from './irs.js';
import { cacheTtlFacet } from './facet.js';

export { cacheTtl, checkCacheTtlData, type CacheTtlFacetData, type CacheTtlChange } from './algorithm.js';
export {
  cacheTtlScene,
  type CacheTtlScene,
  type CacheTtlStep,
  type CacheTtlHeld,
  type CacheTtlAnswer,
} from './scene.js';
export { cacheTtlStageView } from './cache-ttl-stage.js';
export { cacheTtlIRs } from './irs.js';
export { cacheTtlFacet } from './facet.js';

export function registerCacheTtl(): void {
  registerAlgorithm<CacheTtlFacetData>('cacheTtl', cacheTtl, { mechanismKind: 'reactive' });
  registerScenePlan('cacheTtlScene', cacheTtlScene);
  for (const ir of cacheTtlIRs) registerIR(ir.id, ir);
  registerView('cache-ttl-stage', cacheTtlStageView);
  registerFacets([cacheTtlFacet]);
}

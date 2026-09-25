import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { arpCache, type ArpCacheFacetData } from './algorithm.js';
import { arpCacheScene } from './scene.js';
import { arpCacheIRs } from './irs.js';
import { arpCacheStageView } from './arp-cache-stage.js';
import { arpCacheFacet } from './facet.js';

export { arpCache, type ArpCacheFacetData, type ArpHost, type ArpSend } from './algorithm.js';
export { arpCacheScene, type ArpCacheScene, type ArpStep } from './scene.js';
export { arpCacheIRs } from './irs.js';
export { arpCacheStageView } from './arp-cache-stage.js';
export { arpCacheFacet } from './facet.js';

export function registerArpCache(): void {
  registerAlgorithm<ArpCacheFacetData>('arpCache', arpCache, { mechanismKind: 'reactive' });
  registerScenePlan('arpCacheScene', arpCacheScene);
  for (const ir of arpCacheIRs) registerIR(ir.id, ir);
  registerView('arp-cache-stage', arpCacheStageView);
  registerFacets([arpCacheFacet]);
}

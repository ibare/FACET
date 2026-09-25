import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { tlbCachesTranslation, type TlbCachesTranslationFacetData } from './algorithm.js';
import { tlbCachesTranslationScene } from './scene.js';
import { tlbCachesTranslationStageView } from './tlb-caches-translation-stage.js';
import { tlbCachesTranslationIRs } from './irs.js';
import { tlbCachesTranslationFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './tlb-caches-translation-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerTlbCachesTranslation(): void {
  registerAlgorithm<TlbCachesTranslationFacetData>('tlbCachesTranslation', tlbCachesTranslation, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('tlbCachesTranslationScene', tlbCachesTranslationScene);
  for (const ir of tlbCachesTranslationIRs) registerIR(ir.id, ir);
  registerView('tlb-caches-translation-stage', tlbCachesTranslationStageView);
  registerFacets([tlbCachesTranslationFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { neverReuseKeystream, type NeverReuseKeystreamFacetData } from './algorithm.js';
import { neverReuseKeystreamScene } from './scene.js';
import { neverReuseKeystreamIRs } from './irs.js';
import { neverReuseKeystreamStageView } from './never-reuse-keystream-stage.js';
import { neverReuseKeystreamFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './never-reuse-keystream-stage.js';
export * from './facet.js';

export function registerNeverReuseKeystream(): void {
  registerAlgorithm<NeverReuseKeystreamFacetData>('neverReuseKeystream', neverReuseKeystream, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('neverReuseKeystreamScene', neverReuseKeystreamScene);
  for (const ir of neverReuseKeystreamIRs) registerIR(ir.id, ir);
  registerView('never-reuse-keystream-stage', neverReuseKeystreamStageView);
  registerFacets([neverReuseKeystreamFacet]);
}

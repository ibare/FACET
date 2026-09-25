import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { aliasing, type AliasingFacetData } from './algorithm.js';
import { aliasingScene } from './scene.js';
import { aliasingIRs } from './irs.js';
import { aliasingStageView } from './aliasing-stage.js';
import { aliasingFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './aliasing-stage.js';
export * from './facet.js';

export function registerAliasing(): void {
  registerAlgorithm<AliasingFacetData>('aliasing', aliasing, { mechanismKind: 'reactive' });
  registerScenePlan('aliasingScene', aliasingScene);
  for (const ir of aliasingIRs) registerIR(ir.id, ir);
  registerView('aliasing-stage', aliasingStageView);
  registerFacets([aliasingFacet]);
}

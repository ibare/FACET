import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { askWhoHas, type AskWhoHasFacetData } from './algorithm.js';
import { askWhoHasScene } from './scene.js';
import { askWhoHasIRs } from './irs.js';
import { askWhoHasStageView } from './ask-who-has-stage.js';
import { askWhoHasFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './ask-who-has-stage.js';
export * from './facet.js';

export function registerAskWhoHas(): void {
  registerAlgorithm<AskWhoHasFacetData>('askWhoHas', askWhoHas, { mechanismKind: 'reactive' });
  registerScenePlan('askWhoHasScene', askWhoHasScene);
  for (const ir of askWhoHasIRs) registerIR(ir.id, ir);
  registerView('ask-who-has-stage', askWhoHasStageView);
  registerFacets([askWhoHasFacet]);
}

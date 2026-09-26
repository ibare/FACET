import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { memorizeVsGeneralize } from './algorithm.js';
import type { MemorizeVsGeneralizeFacetData } from './algorithm.js';
import { memorizeVsGeneralizeScene } from './scene.js';
import { memorizeVsGeneralizeStageView } from './memorize-vs-generalize-stage.js';
import { memorizeVsGeneralizeIRs } from './irs.js';
import { memorizeVsGeneralizeFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { memorizeVsGeneralizeStageView } from './memorize-vs-generalize-stage.js';
export { memorizeVsGeneralizeIRs } from './irs.js';
export { memorizeVsGeneralizeFacet } from './facet.js';

export function registerMemorizeVsGeneralize(): void {
  registerAlgorithm<MemorizeVsGeneralizeFacetData>('memorizeVsGeneralize', memorizeVsGeneralize, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('memorizeVsGeneralizeScene', memorizeVsGeneralizeScene);
  for (const ir of memorizeVsGeneralizeIRs) registerIR(ir.id, ir);
  registerView('memorize-vs-generalize-stage', memorizeVsGeneralizeStageView);
  registerFacets([memorizeVsGeneralizeFacet]);
}

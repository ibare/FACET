import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { publishToMany, type PublishToManyFacetData } from './algorithm.js';
import { publishToManyScene } from './scene.js';
import { publishToManyStageView } from './publish-to-many-stage.js';
import { publishToManyIRs } from './irs.js';
import { publishToManyFacet } from './facet.js';

export { publishToMany, narrowPublishToManyData, type PublishToManyFacetData } from './algorithm.js';
export { publishToManyScene, type PublishToManyScene, type PublishToManyStep } from './scene.js';
export { publishToManyStageView } from './publish-to-many-stage.js';
export { publishToManyIRs } from './irs.js';
export { publishToManyFacet } from './facet.js';

export function registerPublishToMany(): void {
  registerAlgorithm<PublishToManyFacetData>('publishToMany', publishToMany, { mechanismKind: 'reactive' });
  registerScenePlan('publishToManyScene', publishToManyScene);
  for (const ir of publishToManyIRs) registerIR(ir.id, ir);
  registerView('publish-to-many-stage', publishToManyStageView);
  registerFacets([publishToManyFacet]);
}

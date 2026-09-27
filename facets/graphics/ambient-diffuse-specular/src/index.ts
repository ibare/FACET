import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { ambientDiffuseSpecular, type AmbientDiffuseSpecularFacetData } from './algorithm.js';
import { ambientDiffuseSpecularScene } from './scene.js';
import { ambientDiffuseSpecularStageView } from './ambient-diffuse-specular-stage.js';
import { ambientDiffuseSpecularIRs } from './irs.js';
import { ambientDiffuseSpecularFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './ambient-diffuse-specular-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerAmbientDiffuseSpecular(): void {
  registerAlgorithm<AmbientDiffuseSpecularFacetData>('ambientDiffuseSpecular', ambientDiffuseSpecular, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('ambientDiffuseSpecularScene', ambientDiffuseSpecularScene);
  for (const ir of ambientDiffuseSpecularIRs) registerIR(ir.id, ir);
  registerView('ambient-diffuse-specular-stage', ambientDiffuseSpecularStageView);
  registerFacets([ambientDiffuseSpecularFacet]);
}

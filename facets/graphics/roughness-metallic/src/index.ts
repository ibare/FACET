import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { roughnessMetallic, type RoughnessMetallicFacetData } from './algorithm.js';
import { roughnessMetallicScene } from './scene.js';
import { roughnessMetallicStageView } from './roughness-metallic-stage.js';
import { roughnessMetallicIRs } from './irs.js';
import { roughnessMetallicFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './roughness-metallic-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerRoughnessMetallic(): void {
  registerAlgorithm<RoughnessMetallicFacetData>('roughnessMetallic', roughnessMetallic, { mechanismKind: 'reactive' });
  registerScenePlan('roughnessMetallicScene', roughnessMetallicScene);
  for (const ir of roughnessMetallicIRs) registerIR(ir.id, ir);
  registerView('roughness-metallic-stage', roughnessMetallicStageView);
  registerFacets([roughnessMetallicFacet]);
}

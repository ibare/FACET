import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { noisyPath, type NoisyPathFacetData } from './algorithm.js';
import { noisyPathScene } from './scene.js';
import { noisyPathIRs } from './irs.js';
import { noisyPathStageView } from './noisy-path-stage.js';
import { noisyPathFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { noisyPathIRs } from './irs.js';
export { noisyPathStageView } from './noisy-path-stage.js';
export { noisyPathFacet } from './facet.js';

export function registerNoisyPath(): void {
  registerAlgorithm<NoisyPathFacetData>('noisyPath', noisyPath, { mechanismKind: 'reactive' });
  registerScenePlan('noisyPathScene', noisyPathScene);
  for (const ir of noisyPathIRs) registerIR(ir.id, ir);
  registerView('noisy-path-stage', noisyPathStageView);
  registerFacets([noisyPathFacet]);
}

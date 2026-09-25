import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { externalFragmentation, type ExternalFragmentationFacetData } from './algorithm.js';
import { externalFragmentationScene } from './scene.js';
import { externalFragmentationStageView } from './external-fragmentation-stage.js';
import { externalFragmentationIRs } from './irs.js';
import { externalFragmentationFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './external-fragmentation-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerExternalFragmentation(): void {
  registerAlgorithm<ExternalFragmentationFacetData>('externalFragmentation', externalFragmentation, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('externalFragmentationScene', externalFragmentationScene);
  for (const ir of externalFragmentationIRs) registerIR(ir.id, ir);
  registerView('external-fragmentation-stage', externalFragmentationStageView);
  registerFacets([externalFragmentationFacet]);
}

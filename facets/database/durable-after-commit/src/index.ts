import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { durableAfterCommit, type DurableAfterCommitFacetData } from './algorithm.js';
import { durableAfterCommitScene } from './scene.js';
import { durableAfterCommitStageView } from './durable-after-commit-stage.js';
import { durableAfterCommitIRs } from './irs.js';
import { durableAfterCommitFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './durable-after-commit-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerDurableAfterCommit(): void {
  registerAlgorithm<DurableAfterCommitFacetData>('durableAfterCommit', durableAfterCommit, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('durableAfterCommitScene', durableAfterCommitScene);
  for (const ir of durableAfterCommitIRs) registerIR(ir.id, ir);
  registerView('durable-after-commit-stage', durableAfterCommitStageView);
  registerFacets([durableAfterCommitFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { immutableCopy, type ImmutableCopyFacetData } from './algorithm.js';
import { immutableCopyScene } from './scene.js';
import { immutableCopyStageView } from './immutable-copy-stage.js';
import { immutableCopyIRs } from './irs.js';
import { immutableCopyFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './immutable-copy-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerImmutableCopy(): void {
  registerAlgorithm<ImmutableCopyFacetData>('immutableCopy', immutableCopy, { mechanismKind: 'reactive' });
  registerScenePlan('immutableCopyScene', immutableCopyScene);
  for (const ir of immutableCopyIRs) registerIR(ir.id, ir);
  registerView('immutable-copy-stage', immutableCopyStageView);
  registerFacets([immutableCopyFacet]);
}

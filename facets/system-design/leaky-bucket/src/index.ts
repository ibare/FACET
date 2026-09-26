import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { leakyBucket, type LeakyBucketFacetData } from './algorithm.js';
import { leakyBucketScene } from './scene.js';
import { leakyBucketIRs } from './irs.js';
import { leakyBucketStageView } from './leaky-bucket-stage.js';
import { leakyBucketFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './leaky-bucket-stage.js';
export * from './facet.js';

export function registerLeakyBucket(): void {
  registerAlgorithm<LeakyBucketFacetData>('leakyBucket', leakyBucket, { mechanismKind: 'reactive' });
  registerScenePlan('leakyBucketScene', leakyBucketScene);
  for (const ir of leakyBucketIRs) registerIR(ir.id, ir);
  registerView('leaky-bucket-stage', leakyBucketStageView);
  registerFacets([leakyBucketFacet]);
}

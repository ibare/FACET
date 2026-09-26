import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { tokenBucket, type TokenBucketFacetData } from './algorithm.js';
import { tokenBucketScene } from './scene.js';
import { tokenBucketIRs } from './irs.js';
import { tokenBucketStageView } from './token-bucket-stage.js';
import { tokenBucketFacet } from './facet.js';

export { tokenBucket, narrowTokenBucketData, lastSecond } from './algorithm.js';
export type { TokenBucketFacetData, TokenBucketArrival } from './algorithm.js';
export { tokenBucketScene } from './scene.js';
export type { TokenBucketScene, TokenBucketSecond, TokenBucketNow } from './scene.js';
export { tokenBucketIRs } from './irs.js';
export { tokenBucketStageView } from './token-bucket-stage.js';
export { tokenBucketFacet } from './facet.js';

export function registerTokenBucket(): void {
  registerAlgorithm<TokenBucketFacetData>('tokenBucket', tokenBucket, { mechanismKind: 'reactive' });
  registerScenePlan('tokenBucketScene', tokenBucketScene);
  for (const ir of tokenBucketIRs) registerIR(ir.id, ir);
  registerView('token-bucket-stage', tokenBucketStageView);
  registerFacets([tokenBucketFacet]);
}

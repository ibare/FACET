import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { copyToFollowers, type CopyToFollowersFacetData } from './algorithm.js';
import { copyToFollowersScene } from './scene.js';
import { copyToFollowersStageView } from './copy-to-followers-stage.js';
import { copyToFollowersIRs } from './irs.js';
import { copyToFollowersFacet } from './facet.js';

export { copyToFollowers, type CopyToFollowersFacetData } from './algorithm.js';
export {
  copyToFollowersScene,
  type CopyToFollowersScene,
  type CopyNode,
  type CopyEntry,
  type CopyStep,
} from './scene.js';
export { copyToFollowersStageView } from './copy-to-followers-stage.js';
export { copyToFollowersIRs } from './irs.js';
export { copyToFollowersFacet } from './facet.js';

export function registerCopyToFollowers(): void {
  registerAlgorithm<CopyToFollowersFacetData>('copyToFollowers', copyToFollowers, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('copyToFollowersScene', copyToFollowersScene);
  for (const ir of copyToFollowersIRs) registerIR(ir.id, ir);
  registerView('copy-to-followers-stage', copyToFollowersStageView);
  registerFacets([copyToFollowersFacet]);
}

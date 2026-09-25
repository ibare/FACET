import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lockExcludes, type LockExcludesFacetData } from './algorithm.js';
import { lockExcludesScene } from './scene.js';
import { lockExcludesIRs } from './irs.js';
import { lockExcludesStageView } from './lock-excludes-stage.js';
import { lockExcludesFacet } from './facet.js';

export { lockExcludes, parseLockLine, type LockExcludesFacetData, type LockOp } from './algorithm.js';
export { lockExcludesScene, placeOf, type LockScene, type LockStep, type LockPlace } from './scene.js';
export { lockExcludesIRs } from './irs.js';
export { lockExcludesStageView } from './lock-excludes-stage.js';
export { lockExcludesFacet } from './facet.js';

export function registerLockExcludes(): void {
  registerAlgorithm<LockExcludesFacetData>('lockExcludes', lockExcludes, { mechanismKind: 'reactive' });
  registerScenePlan('lockExcludesScene', lockExcludesScene);
  for (const ir of lockExcludesIRs) registerIR(ir.id, ir);
  registerView('lock-excludes-stage', lockExcludesStageView);
  registerFacets([lockExcludesFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lockWait } from './algorithm.js';
import type { LockWaitFacetData } from './algorithm.js';
import { lockWaitScene } from './scene.js';
import { lockWaitIRs } from './irs.js';
import { lockWaitStageView } from './lock-wait-stage.js';
import { lockWaitFacet } from './facet.js';

export { lockWait, narrowLockWaitData } from './algorithm.js';
export type { LockWaitFacetData, LockWaitStepSpec, WaitEntry } from './algorithm.js';
export { lockWaitScene } from './scene.js';
export type { LockWaitScene, LockWaitStep } from './scene.js';
export { lockWaitStageView } from './lock-wait-stage.js';
export { lockWaitIRs } from './irs.js';
export { lockWaitFacet } from './facet.js';

export function registerLockWait(): void {
  registerAlgorithm<LockWaitFacetData>('lockWait', lockWait, { mechanismKind: 'reactive' });
  registerScenePlan('lockWaitScene', lockWaitScene);
  for (const ir of lockWaitIRs) registerIR(ir.id, ir);
  registerView('lock-wait-stage', lockWaitStageView);
  registerFacets([lockWaitFacet]);
}

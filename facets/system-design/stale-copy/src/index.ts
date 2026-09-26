import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { staleCopy, type StaleCopyFacetData } from './algorithm.js';
import { staleCopyScene } from './scene.js';
import { staleCopyStageView } from './stale-copy-stage.js';
import { staleCopyIRs } from './irs.js';
import { staleCopyFacet } from './facet.js';

export { staleCopy, narrowStaleCopyData } from './algorithm.js';
export type { StaleCopyFacetData, StaleCopyOp, StaleCopyServer } from './algorithm.js';
export { staleCopyScene } from './scene.js';
export type { StaleCopyScene, StaleCopyStep, StaleCopyRead, StaleCopyTally, StaleCopyCopy } from './scene.js';
export { staleCopyStageView } from './stale-copy-stage.js';
export { staleCopyIRs } from './irs.js';
export { staleCopyFacet } from './facet.js';

export function registerStaleCopy(): void {
  registerAlgorithm<StaleCopyFacetData>('staleCopy', staleCopy, { mechanismKind: 'reactive' });
  registerScenePlan('staleCopyScene', staleCopyScene);
  for (const ir of staleCopyIRs) registerIR(ir.id, ir);
  registerView('stale-copy-stage', staleCopyStageView);
  registerFacets([staleCopyFacet]);
}

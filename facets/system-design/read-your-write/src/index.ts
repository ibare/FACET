import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { readYourWrite, type ReadYourWriteFacetData } from './algorithm.js';
import { readYourWriteScene } from './scene.js';
import { readYourWriteIRs } from './irs.js';
import { readYourWriteStageView } from './read-your-write-stage.js';
import { readYourWriteFacet } from './facet.js';

export {
  readYourWrite,
  parseReadYourWriteData,
  nextReplica,
  type ReadYourWriteFacetData,
} from './algorithm.js';
export { readYourWriteScene, type ReadYourWriteScene } from './scene.js';
export { readYourWriteIRs } from './irs.js';
export { readYourWriteStageView } from './read-your-write-stage.js';
export { readYourWriteFacet } from './facet.js';

export function registerReadYourWrite(): void {
  registerAlgorithm<ReadYourWriteFacetData>('readYourWrite', readYourWrite, { mechanismKind: 'reactive' });
  registerScenePlan('readYourWriteScene', readYourWriteScene);
  for (const ir of readYourWriteIRs) registerIR(ir.id, ir);
  registerView('read-your-write-stage', readYourWriteStageView);
  registerFacets([readYourWriteFacet]);
}

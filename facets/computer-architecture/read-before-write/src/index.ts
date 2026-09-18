import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { readBeforeWrite, type ReadBeforeWriteFacetData } from './algorithm.js';
import { readBeforeWriteFacet } from './facet.js';
import { readBeforeWriteIRs } from './irs.js';
import { readBeforeWriteStageView } from './read-before-write-stage.js';
import { readBeforeWriteScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export { readBeforeWriteStageView } from './read-before-write-stage.js';
export { readBeforeWriteIRs } from './irs.js';
export { readBeforeWriteFacet } from './facet.js';

export function registerReadBeforeWrite(): void {
  registerAlgorithm<ReadBeforeWriteFacetData>('readBeforeWrite', readBeforeWrite, { mechanismKind: 'reactive' });
  registerScenePlan('readBeforeWriteScene', readBeforeWriteScene);
  for (const ir of readBeforeWriteIRs) registerIR(ir.id, ir);
  registerView('read-before-write-stage', readBeforeWriteStageView);
  registerFacets([readBeforeWriteFacet]);
}

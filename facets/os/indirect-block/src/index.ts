import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { indirectBlock, type IndirectBlockFacetData } from './algorithm.js';
import { indirectBlockScene } from './scene.js';
import { indirectBlockStageView } from './indirect-block-stage.js';
import { indirectBlockIRs } from './irs.js';
import { indirectBlockFacet } from './facet.js';

export { indirectBlock, type IndirectBlockFacetData } from './algorithm.js';
export {
  indirectBlockScene,
  type IndirectBlockScene,
  type IndirectBlockStep,
} from './scene.js';
export { indirectBlockStageView } from './indirect-block-stage.js';
export { indirectBlockIRs } from './irs.js';
export { indirectBlockFacet } from './facet.js';

export function registerIndirectBlock(): void {
  registerAlgorithm<IndirectBlockFacetData>('indirectBlock', indirectBlock, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('indirectBlockScene', indirectBlockScene);
  for (const ir of indirectBlockIRs) registerIR(ir.id, ir);
  registerView('indirect-block-stage', indirectBlockStageView);
  registerFacets([indirectBlockFacet]);
}

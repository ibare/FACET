import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { fixedSizeBlock, type FixedSizeBlockFacetData } from './algorithm.js';
import { fixedSizeBlockFacet } from './facet.js';
import { fixedSizeBlockStageView } from './fixed-size-block-stage.js';
import { fixedSizeBlockIRs } from './irs.js';
import { fixedSizeBlockScene } from './scene.js';

export {
  BLOCK_BYTES,
  encryptBlock,
  fixedSizeBlock,
  hex16,
  hex8,
  narrowFixedSizeBlock,
  type FixedSizeBlockFacetData,
  type FixedSizeBlockInput,
} from './algorithm.js';
export {
  fixedSizeBlockScene,
  type FixedSizeBlockBase,
  type FixedSizeBlockPad,
  type FixedSizeBlockScene,
  type FixedSizeBlockSeal,
  type FixedSizeBlockStep,
} from './scene.js';
export { fixedSizeBlockStageView } from './fixed-size-block-stage.js';
export { fixedSizeBlockIRs } from './irs.js';
export { fixedSizeBlockFacet } from './facet.js';

export function registerFixedSizeBlock(): void {
  registerAlgorithm<FixedSizeBlockFacetData>('fixedSizeBlock', fixedSizeBlock, { mechanismKind: 'reactive' });
  registerScenePlan('fixedSizeBlockScene', fixedSizeBlockScene);
  for (const ir of fixedSizeBlockIRs) registerIR(ir.id, ir);
  registerView('fixed-size-block-stage', fixedSizeBlockStageView);
  registerFacets([fixedSizeBlockFacet]);
}

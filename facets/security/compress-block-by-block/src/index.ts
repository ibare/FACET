import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { compressBlockByBlock, type CompressBlockByBlockFacetData } from './algorithm.js';
import { compressBlockByBlockScene } from './scene.js';
import { compressBlockByBlockStageView } from './compress-block-by-block-stage.js';
import { compressBlockByBlockIRs } from './irs.js';
import { compressBlockByBlockFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { compressBlockByBlockStageView } from './compress-block-by-block-stage.js';
export { compressBlockByBlockIRs } from './irs.js';
export { compressBlockByBlockFacet } from './facet.js';

export function registerCompressBlockByBlock(): void {
  registerAlgorithm<CompressBlockByBlockFacetData>('compressBlockByBlock', compressBlockByBlock, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('compressBlockByBlockScene', compressBlockByBlockScene);
  for (const ir of compressBlockByBlockIRs) registerIR(ir.id, ir);
  registerView('compress-block-by-block-stage', compressBlockByBlockStageView);
  registerFacets([compressBlockByBlockFacet]);
}

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { inodePointsBlocks, type InodePointsBlocksFacetData } from './algorithm.js';
import { inodePointsBlocksScene } from './scene.js';
import { inodePointsBlocksIRs } from './irs.js';
import { inodePointsBlocksStageView } from './inode-points-blocks-stage.js';
import { inodePointsBlocksFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './inode-points-blocks-stage.js';
export * from './facet.js';

export function registerInodePointsBlocks(): void {
  registerAlgorithm<InodePointsBlocksFacetData>('inodePointsBlocks', inodePointsBlocks, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('inodePointsBlocksScene', inodePointsBlocksScene);
  for (const ir of inodePointsBlocksIRs) registerIR(ir.id, ir);
  registerView('inode-points-blocks-stage', inodePointsBlocksStageView);
  registerFacets([inodePointsBlocksFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { chainOfBlocks, type ChainOfBlocksFacetData } from './algorithm.js';
import { chainOfBlocksScene } from './scene.js';
import { chainOfBlocksStageView } from './chain-of-blocks-stage.js';
import { chainOfBlocksIRs } from './irs.js';
import { chainOfBlocksFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './chain-of-blocks-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerChainOfBlocks(): void {
  registerAlgorithm<ChainOfBlocksFacetData>('chainOfBlocks', chainOfBlocks, { mechanismKind: 'reactive' });
  registerScenePlan('chainOfBlocksScene', chainOfBlocksScene);
  for (const ir of chainOfBlocksIRs) registerIR(ir.id, ir);
  registerView('chain-of-blocks-stage', chainOfBlocksStageView);
  registerFacets([chainOfBlocksFacet]);
}

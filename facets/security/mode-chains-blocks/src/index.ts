import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { modeChainsBlocks, type ModeChainsBlocksFacetData } from './algorithm.js';
import { modeChainsBlocksScene } from './scene.js';
import { modeChainsBlocksIRs } from './irs.js';
import { modeChainsBlocksStageView } from './mode-chains-blocks-stage.js';
import { modeChainsBlocksFacet } from './facet.js';

export { modeChainsBlocks, encryptBlock, narrowModeChainsBlocks, type ModeChainsBlocksFacetData } from './algorithm.js';
export { modeChainsBlocksScene, type ModeChainsBlocksScene } from './scene.js';
export { modeChainsBlocksIRs } from './irs.js';
export { modeChainsBlocksStageView } from './mode-chains-blocks-stage.js';
export { modeChainsBlocksFacet } from './facet.js';

export function registerModeChainsBlocks(): void {
  registerAlgorithm<ModeChainsBlocksFacetData>('modeChainsBlocks', modeChainsBlocks, { mechanismKind: 'reactive' });
  registerScenePlan('modeChainsBlocksScene', modeChainsBlocksScene);
  for (const ir of modeChainsBlocksIRs) registerIR(ir.id, ir);
  registerView('mode-chains-blocks-stage', modeChainsBlocksStageView);
  registerFacets([modeChainsBlocksFacet]);
}

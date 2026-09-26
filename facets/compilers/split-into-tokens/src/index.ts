/**
 * split-into-tokens — 등록 진입점. 호출은 호스트 몫이다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { splitIntoTokens, type SplitIntoTokensFacetData } from './algorithm.js';
import { splitIntoTokensScene } from './scene.js';
import { splitIntoTokensIRs } from './irs.js';
import { splitIntoTokensStageView } from './split-into-tokens-stage.js';
import { splitIntoTokensFacet } from './facet.js';

export { splitIntoTokens, splitChunks, type SplitIntoTokensFacetData, type Chunk } from './algorithm.js';
export { splitIntoTokensScene, type SplitScene, type SplitStep, type SplitChunk } from './scene.js';
export { splitIntoTokensIRs } from './irs.js';
export { splitIntoTokensStageView } from './split-into-tokens-stage.js';
export { splitIntoTokensFacet } from './facet.js';

export function registerSplitIntoTokens(): void {
  registerAlgorithm<SplitIntoTokensFacetData>('splitIntoTokens', splitIntoTokens, { mechanismKind: 'reactive' });
  registerScenePlan('splitIntoTokensScene', splitIntoTokensScene);
  for (const ir of splitIntoTokensIRs) registerIR(ir.id, ir);
  registerView('split-into-tokens-stage', splitIntoTokensStageView);
  registerFacets([splitIntoTokensFacet]);
}

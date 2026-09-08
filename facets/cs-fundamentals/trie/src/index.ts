/**
 * @ffacet/algorithm-trie — 접두사 나무 완결형 번들.
 */

export { trie, type TrieData } from './algorithm.js';
export { trieProjector } from './projector.js';
export { trieIRs, trieSearchIR } from './irs.js';
export { trieFacet } from './facet.js';
export { trieDescription } from './description.js';
export { trieStageView, type TrieStage, type StageNode } from './trie-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { trie, type TrieData } from './algorithm.js';
import { trieProjector } from './projector.js';
import { trieIRs } from './irs.js';
import { trieFacet } from './facet.js';
import { trieDescription } from './description.js';
import { trieStageView } from './trie-stage.js';

export function registerTrie(): void {
  registerAlgorithm<TrieData>('trie', trie, { mechanismKind: 'reactive' });
  registerProjector('trieProjector', trieProjector);
  for (const ir of trieIRs) registerIR(ir.id, ir);
  registerView('trie-stage', trieStageView);
  registerFacets([trieFacet]);
  registerDescription(trieFacet.id, trieDescription);
}

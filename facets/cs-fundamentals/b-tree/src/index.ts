/**
 * @ffacet/algorithm-b-tree — B-트리 완결형 번들.
 */

export { bTree, type BTreeData } from './algorithm.js';
export { bTreeProjector } from './projector.js';
export { bTreeIRs, bTreeSearchIR } from './irs.js';
export { bTreeFacet } from './facet.js';
export { bTreeDescription } from './description.js';
export { bTreeStageView, type BTreeStage, type StageNode } from './b-tree-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { bTree, type BTreeData } from './algorithm.js';
import { bTreeProjector } from './projector.js';
import { bTreeIRs } from './irs.js';
import { bTreeFacet } from './facet.js';
import { bTreeDescription } from './description.js';
import { bTreeStageView } from './b-tree-stage.js';

export function registerBTree(): void {
  registerAlgorithm<BTreeData>('bTree', bTree, { mechanismKind: 'reactive' });
  registerProjector('bTreeProjector', bTreeProjector);
  for (const ir of bTreeIRs) registerIR(ir.id, ir);
  registerView('b-tree-stage', bTreeStageView);
  registerFacets([bTreeFacet]);
  registerDescription(bTreeFacet.id, bTreeDescription);
}

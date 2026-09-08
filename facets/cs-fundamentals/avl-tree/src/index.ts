/**
 * @ffacet/algorithm-avl-tree — AVL 트리 완제품 번들.
 */

export { avlTree, type AvlTreeData } from './algorithm.js';
export { avlTreeProjector } from './projector.js';
export { avlTreeIRs, avlRebalanceIR } from './irs.js';
export { avlTreeFacet } from './facet.js';
export { avlTreeDescription } from './description.js';
export { avlTreeStageView, type AvlTreeStage, type StageNode } from './avl-tree-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { avlTree, type AvlTreeData } from './algorithm.js';
import { avlTreeProjector } from './projector.js';
import { avlTreeIRs } from './irs.js';
import { avlTreeFacet } from './facet.js';
import { avlTreeDescription } from './description.js';
import { avlTreeStageView } from './avl-tree-stage.js';

export function registerAvlTree(): void {
  registerAlgorithm<AvlTreeData>('avlTree', avlTree, { mechanismKind: 'reactive' });
  registerProjector('avlTreeProjector', avlTreeProjector);
  for (const ir of avlTreeIRs) registerIR(ir.id, ir);
  registerView('avl-tree-stage', avlTreeStageView);
  registerFacets([avlTreeFacet]);
  registerDescription(avlTreeFacet.id, avlTreeDescription);
}

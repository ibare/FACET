/**
 * @ffacet/algorithm-red-black-tree — 레드-블랙 트리 완제품 번들.
 */

export { redBlackTree, type RedBlackTreeData } from './algorithm.js';
export { redBlackTreeProjector } from './projector.js';
export { redBlackTreeIRs, rbInsertFixupIR } from './irs.js';
export { redBlackTreeFacet } from './facet.js';
export { redBlackTreeDescription } from './description.js';
export { redBlackTreeStageView, type RedBlackTreeStage, type StageNode } from './red-black-tree-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { redBlackTree, type RedBlackTreeData } from './algorithm.js';
import { redBlackTreeProjector } from './projector.js';
import { redBlackTreeIRs } from './irs.js';
import { redBlackTreeFacet } from './facet.js';
import { redBlackTreeDescription } from './description.js';
import { redBlackTreeStageView } from './red-black-tree-stage.js';

export function registerRedBlackTree(): void {
  registerAlgorithm<RedBlackTreeData>('redBlackTree', redBlackTree, { mechanismKind: 'reactive' });
  registerProjector('redBlackTreeProjector', redBlackTreeProjector);
  for (const ir of redBlackTreeIRs) registerIR(ir.id, ir);
  registerView('red-black-tree-stage', redBlackTreeStageView);
  registerFacets([redBlackTreeFacet]);
  registerDescription(redBlackTreeFacet.id, redBlackTreeDescription);
}

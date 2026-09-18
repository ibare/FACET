import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';

import { arrayTraversalOrderAlgorithm } from './algorithm.js';
import { arrayTraversalOrderStageView } from './array-traversal-order-stage.js';
import { arrayTraversalOrderFacet } from './facet.js';
import { arrayTraversalOrderIRs } from './irs.js';
import { arrayTraversalOrderProjector } from './projector.js';

export {
  arrayTraversalOrderAlgorithm,
  computeArrayTraversalOrderResult,
  roundPercent,
} from './algorithm.js';
export type { ArrayTraversalOrderData, TraversalAccess, TraversalResult } from './algorithm.js';
export { arrayTraversalOrderProjector } from './projector.js';
export { arrayTraversalOrderImperativeIR, arrayTraversalOrderIRs } from './irs.js';
export { arrayTraversalOrderStageView } from './array-traversal-order-stage.js';
export type { ArrayTraversalOrderStage } from './array-traversal-order-stage.js';
export { arrayTraversalOrderFacet } from './facet.js';

export function registerArrayTraversalOrder(): void {
  registerAlgorithm('arrayTraversalOrder', arrayTraversalOrderAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('arrayTraversalOrderProjector', arrayTraversalOrderProjector);
  for (const ir of arrayTraversalOrderIRs) registerIR(ir.id, ir);
  registerView('array-traversal-order-stage', arrayTraversalOrderStageView);
  registerFacets([arrayTraversalOrderFacet]);
}

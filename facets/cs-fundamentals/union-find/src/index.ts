/**
 * @ffacet/algorithm-union-find — 서로소 집합 완결형 번들.
 */

export { unionFind, type UnionFindData } from './algorithm.js';
export { unionFindProjector } from './projector.js';
export { unionFindIRs } from './irs.js';
export { unionFindFacet } from './facet.js';
export { unionFindDescription } from './description.js';
export { unionFindStageView, type UnionFindStage } from './union-find-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { unionFind, type UnionFindData } from './algorithm.js';
import { unionFindProjector } from './projector.js';
import { unionFindIRs } from './irs.js';
import { unionFindFacet } from './facet.js';
import { unionFindDescription } from './description.js';
import { unionFindStageView } from './union-find-stage.js';

export function registerUnionFind(): void {
  registerAlgorithm<UnionFindData>('unionFind', unionFind, {
    mechanismKind: 'reactive',
  });
  registerProjector('unionFindProjector', unionFindProjector);
  for (const ir of unionFindIRs) registerIR(ir.id, ir);
  registerView('union-find-stage', unionFindStageView);
  registerFacets([unionFindFacet]);
  registerDescription(unionFindFacet.id, unionFindDescription);
}

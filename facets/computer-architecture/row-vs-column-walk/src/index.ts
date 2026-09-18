import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { rowVsColumnWalk, type RowVsColumnWalkFacetData } from './algorithm.js';
import { rowVsColumnWalkScene } from './scene.js';
import { rowVsColumnWalkStageView } from './row-vs-column-walk-stage.js';
import { rowVsColumnWalkIRs } from './irs.js';
import { rowVsColumnWalkFacet } from './facet.js';

export { rowVsColumnWalk, type RowVsColumnWalkFacetData } from './algorithm.js';
export type { Walk, WalkRead, SweepPayload } from './algorithm.js';
export { rowVsColumnWalkScene, type RowVsColumnWalkScene } from './scene.js';
export { rowVsColumnWalkStageView } from './row-vs-column-walk-stage.js';
export { rowVsColumnWalkIRs } from './irs.js';
export { rowVsColumnWalkFacet } from './facet.js';

export function registerRowVsColumnWalk(): void {
  registerAlgorithm<RowVsColumnWalkFacetData>('rowVsColumnWalk', rowVsColumnWalk, { mechanismKind: 'reactive' });
  registerScenePlan('rowVsColumnWalkScene', rowVsColumnWalkScene);
  for (const ir of rowVsColumnWalkIRs) registerIR(ir.id, ir);
  registerView('row-vs-column-walk-stage', rowVsColumnWalkStageView);
  registerFacets([rowVsColumnWalkFacet]);
}

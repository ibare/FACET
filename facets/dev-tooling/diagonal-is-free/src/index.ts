import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { diagonalIsFree, type DiagonalIsFreeFacetData } from './algorithm';
import { diagonalIsFreeScene } from './scene';
import { diagonalIsFreeStageView } from './diagonal-is-free-stage';
import { diagonalIsFreeIRs } from './irs';
import { diagonalIsFreeFacet } from './facet';

export {
  diagonalIsFree,
  isFree,
  myersReaches,
  readLines,
  type DiagonalIsFreeFacetData,
  type MyersMove,
  type MyersReach,
} from './algorithm';
export { diagonalIsFreeScene, type DiagonalIsFreeScene } from './scene';
export { diagonalIsFreeStageView } from './diagonal-is-free-stage';
export { diagonalIsFreeIRs } from './irs';
export { diagonalIsFreeFacet } from './facet';

export function registerDiagonalIsFree(): void {
  registerAlgorithm<DiagonalIsFreeFacetData>('diagonalIsFree', diagonalIsFree, { mechanismKind: 'reactive' });
  registerScenePlan('diagonalIsFreeScene', diagonalIsFreeScene);
  for (const ir of diagonalIsFreeIRs) registerIR(ir.id, ir);
  registerView('diagonal-is-free-stage', diagonalIsFreeStageView);
  registerFacets([diagonalIsFreeFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { twoNetsCompete, type TwoNetsCompeteFacetData } from './algorithm';
import { twoNetsCompeteScene } from './scene';
import { twoNetsCompeteStageView } from './two-nets-compete-stage';
import { twoNetsCompeteIRs } from './irs';
import { twoNetsCompeteFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './two-nets-compete-stage';
export * from './irs';
export * from './facet';

export function registerTwoNetsCompete(): void {
  registerAlgorithm<TwoNetsCompeteFacetData>('twoNetsCompete', twoNetsCompete, { mechanismKind: 'reactive' });
  registerScenePlan('twoNetsCompeteScene', twoNetsCompeteScene);
  for (const ir of twoNetsCompeteIRs) registerIR(ir.id, ir);
  registerView('two-nets-compete-stage', twoNetsCompeteStageView);
  registerFacets([twoNetsCompeteFacet]);
}

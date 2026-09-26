import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { twoTreesMeet, type TwoTreesMeetFacetData } from './algorithm';
import { twoTreesMeetScene } from './scene';
import { twoTreesMeetStageView } from './two-trees-meet-stage';
import { twoTreesMeetIRs } from './irs';
import { twoTreesMeetFacet } from './facet';

export * from './algorithm';
export * from './scene';
export { twoTreesMeetStageView } from './two-trees-meet-stage';
export { twoTreesMeetIRs } from './irs';
export { twoTreesMeetFacet } from './facet';

export function registerTwoTreesMeet(): void {
  registerAlgorithm<TwoTreesMeetFacetData>('twoTreesMeet', twoTreesMeet, { mechanismKind: 'reactive' });
  registerScenePlan('twoTreesMeetScene', twoTreesMeetScene);
  for (const ir of twoTreesMeetIRs) registerIR(ir.id, ir);
  registerView('two-trees-meet-stage', twoTreesMeetStageView);
  registerFacets([twoTreesMeetFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { nobodyCanBeFirst, type NobodyCanBeFirstFacetData } from './algorithm';
import { nobodyCanBeFirstScene } from './scene';
import { nobodyCanBeFirstStageView } from './nobody-can-be-first-stage';
import { nobodyCanBeFirstIRs } from './irs';
import { nobodyCanBeFirstFacet } from './facet';

export {
  nobodyCanBeFirst,
  readGraph,
  type NobodyCanBeFirstFacetData,
  type NobodyCanBeFirstRule,
} from './algorithm';
export {
  nobodyCanBeFirstScene,
  type NobodyCanBeFirstScene,
  type NobodyCanBeFirstStep,
} from './scene';
export { nobodyCanBeFirstStageView } from './nobody-can-be-first-stage';
export { nobodyCanBeFirstIRs } from './irs';
export { nobodyCanBeFirstFacet } from './facet';

export function registerNobodyCanBeFirst(): void {
  registerAlgorithm<NobodyCanBeFirstFacetData>('nobodyCanBeFirst', nobodyCanBeFirst, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('nobodyCanBeFirstScene', nobodyCanBeFirstScene);
  for (const ir of nobodyCanBeFirstIRs) registerIR(ir.id, ir);
  registerView('nobody-can-be-first-stage', nobodyCanBeFirstStageView);
  registerFacets([nobodyCanBeFirstFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sawtooth, type SawtoothFacetData } from './algorithm';
import { sawtoothScene } from './scene';
import { sawtoothStageView } from './sawtooth-stage';
import { sawtoothIRs } from './irs';
import { sawtoothFacet } from './facet';

export { sawtooth, type SawtoothFacetData } from './algorithm';
export {
  sawtoothScene,
  type SawtoothScene,
  type SawtoothMark,
  type SawtoothTooth,
  type SawtoothStep,
} from './scene';
export { sawtoothStageView } from './sawtooth-stage';
export { sawtoothIRs } from './irs';
export { sawtoothFacet } from './facet';

export function registerSawtooth(): void {
  registerAlgorithm<SawtoothFacetData>('sawtooth', sawtooth, { mechanismKind: 'reactive' });
  registerScenePlan('sawtoothScene', sawtoothScene);
  for (const ir of sawtoothIRs) registerIR(ir.id, ir);
  registerView('sawtooth-stage', sawtoothStageView);
  registerFacets([sawtoothFacet]);
}

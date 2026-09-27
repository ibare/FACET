import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { powerSet, type PowerSetFacetData } from './algorithm.js';
import { powerSetScene } from './scene.js';
import { powerSetIRs } from './irs.js';
import { powerSetStageView } from './power-set-stage.js';
import { powerSetFacet } from './facet.js';

export { powerSet, narrowPowerSetData, takeElement, type PowerSetFacetData } from './algorithm.js';
export { powerSetScene, type PowerSetScene, type PowerSetStep } from './scene.js';
export { powerSetIRs } from './irs.js';
export { powerSetStageView } from './power-set-stage.js';
export { powerSetFacet } from './facet.js';

export function registerPowerSet(): void {
  registerAlgorithm<PowerSetFacetData>('powerSet', powerSet, { mechanismKind: 'reactive' });
  registerScenePlan('powerSetScene', powerSetScene);
  for (const ir of powerSetIRs) registerIR(ir.id, ir);
  registerView('power-set-stage', powerSetStageView);
  registerFacets([powerSetFacet]);
}

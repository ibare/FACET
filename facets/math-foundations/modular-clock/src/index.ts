import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { modularClock, type ModularClockFacetData } from './algorithm';
import { modularClockScene } from './scene';
import { modularClockStageView } from './modular-clock-stage';
import { modularClockIRs } from './irs';
import { modularClockFacet } from './facet';

export { modularClock, narrowModularClockData, splitByModulus, type ModularClockFacetData } from './algorithm';
export {
  modularClockScene,
  type ModularClockScene,
  type ModularClockMark,
  type ModularClockStep,
  type ModularClockPass,
} from './scene';
export { modularClockStageView } from './modular-clock-stage';
export { modularClockIRs } from './irs';
export { modularClockFacet } from './facet';

export function registerModularClock(): void {
  registerAlgorithm<ModularClockFacetData>('modularClock', modularClock, { mechanismKind: 'reactive' });
  registerScenePlan('modularClockScene', modularClockScene);
  for (const ir of modularClockIRs) registerIR(ir.id, ir);
  registerView('modular-clock-stage', modularClockStageView);
  registerFacets([modularClockFacet]);
}

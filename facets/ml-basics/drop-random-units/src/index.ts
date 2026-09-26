import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { dropRandomUnits, type DropRandomUnitsFacetData } from './algorithm.js';
import { dropRandomUnitsScene } from './scene.js';
import { dropRandomUnitsStageView } from './drop-random-units-stage.js';
import { dropRandomUnitsIRs } from './irs.js';
import { dropRandomUnitsFacet } from './facet.js';

export { dropRandomUnits, narrowDropRandomUnitsData, type DropRandomUnitsFacetData } from './algorithm.js';
export { dropRandomUnitsScene, type DropRandomUnitsScene } from './scene.js';
export { dropRandomUnitsStageView } from './drop-random-units-stage.js';
export { dropRandomUnitsIRs } from './irs.js';
export { dropRandomUnitsFacet } from './facet.js';

export function registerDropRandomUnits(): void {
  registerAlgorithm<DropRandomUnitsFacetData>('dropRandomUnits', dropRandomUnits, { mechanismKind: 'reactive' });
  registerScenePlan('dropRandomUnitsScene', dropRandomUnitsScene);
  for (const ir of dropRandomUnitsIRs) registerIR(ir.id, ir);
  registerView('drop-random-units-stage', dropRandomUnitsStageView);
  registerFacets([dropRandomUnitsFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { rotateTurns, type RotateTurnsFacetData } from './algorithm.js';
import { rotateTurnsScene } from './scene.js';
import { rotateTurnsStageView } from './rotate-turns-stage.js';
import { rotateTurnsIRs } from './irs.js';
import { rotateTurnsFacet } from './facet.js';

export { rotateTurns, type RotateTurnsFacetData } from './algorithm.js';
export { rotateTurnsScene, type RotateTurnsScene } from './scene.js';
export { rotateTurnsStageView } from './rotate-turns-stage.js';
export { rotateTurnsIRs } from './irs.js';
export { rotateTurnsFacet } from './facet.js';

export function registerRotateTurns(): void {
  registerAlgorithm<RotateTurnsFacetData>('rotateTurns', rotateTurns, { mechanismKind: 'reactive' });
  registerScenePlan('rotateTurnsScene', rotateTurnsScene);
  for (const ir of rotateTurnsIRs) registerIR(ir.id, ir);
  registerView('rotate-turns-stage', rotateTurnsStageView);
  registerFacets([rotateTurnsFacet]);
}

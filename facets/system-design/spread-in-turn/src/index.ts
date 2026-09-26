import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { spreadInTurn, type SpreadInTurnFacetData } from './algorithm.js';
import { spreadInTurnScene } from './scene.js';
import { spreadInTurnStageView } from './spread-in-turn-stage.js';
import { spreadInTurnIRs } from './irs.js';
import { spreadInTurnFacet } from './facet.js';

export { spreadInTurn, readSpreadData } from './algorithm.js';
export type { SpreadInTurnFacetData, SpreadRequest } from './algorithm.js';
export { spreadInTurnScene } from './scene.js';
export type { SpreadScene, SpreadStep } from './scene.js';
export { spreadInTurnStageView } from './spread-in-turn-stage.js';
export { spreadInTurnIRs } from './irs.js';
export { spreadInTurnFacet } from './facet.js';

export function registerSpreadInTurn(): void {
  registerAlgorithm<SpreadInTurnFacetData>('spreadInTurn', spreadInTurn, { mechanismKind: 'reactive' });
  registerScenePlan('spreadInTurnScene', spreadInTurnScene);
  for (const ir of spreadInTurnIRs) registerIR(ir.id, ir);
  registerView('spread-in-turn-stage', spreadInTurnStageView);
  registerFacets([spreadInTurnFacet]);
}

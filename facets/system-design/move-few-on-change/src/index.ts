import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { moveFewOnChange, type MoveFewOnChangeFacetData } from './algorithm.js';
import { moveFewOnChangeScene } from './scene.js';
import { moveFewOnChangeStageView } from './move-few-on-change-stage.js';
import { moveFewOnChangeIRs } from './irs.js';
import { moveFewOnChangeFacet } from './facet.js';

export {
  moveFewOnChange,
  narrowMoveFewData,
  h32,
  ringPos,
  ringOwner,
  type MoveFewOnChangeFacetData,
  type ServerBase,
  type KeyBase,
} from './algorithm.js';
export { moveFewOnChangeScene, movedCounts, type MoveFewScene, type MoveFewStep, type Placed } from './scene.js';
export { moveFewOnChangeStageView } from './move-few-on-change-stage.js';
export { moveFewOnChangeIRs } from './irs.js';
export { moveFewOnChangeFacet } from './facet.js';

export function registerMoveFewOnChange(): void {
  registerAlgorithm<MoveFewOnChangeFacetData>('moveFewOnChange', moveFewOnChange, { mechanismKind: 'reactive' });
  registerScenePlan('moveFewOnChangeScene', moveFewOnChangeScene);
  for (const ir of moveFewOnChangeIRs) registerIR(ir.id, ir);
  registerView('move-few-on-change-stage', moveFewOnChangeStageView);
  registerFacets([moveFewOnChangeFacet]);
}

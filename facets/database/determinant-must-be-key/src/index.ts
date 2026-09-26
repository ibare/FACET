/** determinant-must-be-key 조각 — 결정자를 씨앗으로 번지게 해 열쇠인지 가른다. */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { determinantMustBeKey, type DeterminantMustBeKeyFacetData } from './algorithm.js';
import { determinantMustBeKeyScene } from './scene.js';
import { determinantMustBeKeyStageView } from './determinant-must-be-key-stage.js';
import { determinantMustBeKeyIRs } from './irs.js';
import { determinantMustBeKeyFacet } from './facet.js';

export { determinantMustBeKey, type DeterminantMustBeKeyFacetData } from './algorithm.js';
export * from './scene.js';
export { determinantMustBeKeyStageView } from './determinant-must-be-key-stage.js';
export { determinantMustBeKeyIRs } from './irs.js';
export { determinantMustBeKeyFacet } from './facet.js';

export function registerDeterminantMustBeKey(): void {
  registerAlgorithm<DeterminantMustBeKeyFacetData>('determinantMustBeKey', determinantMustBeKey, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('determinantMustBeKeyScene', determinantMustBeKeyScene);
  for (const ir of determinantMustBeKeyIRs) registerIR(ir.id, ir);
  registerView('determinant-must-be-key-stage', determinantMustBeKeyStageView);
  registerFacets([determinantMustBeKeyFacet]);
}

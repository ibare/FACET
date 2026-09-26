import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { smallerKeySameStrength, type SmallerKeySameStrengthFacetData } from './algorithm.js';
import { smallerKeySameStrengthScene } from './scene.js';
import { smallerKeySameStrengthStageView } from './smaller-key-same-strength-stage.js';
import { smallerKeySameStrengthIRs } from './irs.js';
import { smallerKeySameStrengthFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './smaller-key-same-strength-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerSmallerKeySameStrength(): void {
  registerAlgorithm<SmallerKeySameStrengthFacetData>('smallerKeySameStrength', smallerKeySameStrength, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('smallerKeySameStrengthScene', smallerKeySameStrengthScene);
  for (const ir of smallerKeySameStrengthIRs) registerIR(ir.id, ir);
  registerView('smaller-key-same-strength-stage', smallerKeySameStrengthStageView);
  registerFacets([smallerKeySameStrengthFacet]);
}

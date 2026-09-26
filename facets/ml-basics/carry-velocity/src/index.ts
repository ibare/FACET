import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { carryVelocity, type CarryVelocityFacetData } from './algorithm.js';
import { carryVelocityScene } from './scene.js';
import { carryVelocityStageView } from './carry-velocity-stage.js';
import { carryVelocityIRs } from './irs.js';
import { carryVelocityFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './carry-velocity-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerCarryVelocity(): void {
  registerAlgorithm<CarryVelocityFacetData>('carryVelocity', carryVelocity, { mechanismKind: 'reactive' });
  registerScenePlan('carryVelocityScene', carryVelocityScene);
  for (const ir of carryVelocityIRs) registerIR(ir.id, ir);
  registerView('carry-velocity-stage', carryVelocityStageView);
  registerFacets([carryVelocityFacet]);
}

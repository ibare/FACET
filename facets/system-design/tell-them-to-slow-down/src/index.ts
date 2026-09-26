import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { tellThemToSlowDown, type TellThemToSlowDownFacetData } from './algorithm.js';
import { tellThemToSlowDownScene } from './scene.js';
import { tellThemToSlowDownStageView } from './tell-them-to-slow-down-stage.js';
import { tellThemToSlowDownIRs } from './irs.js';
import { tellThemToSlowDownFacet } from './facet.js';

export {
  tellThemToSlowDown,
  narrowTellThemToSlowDownData,
  simulateCredits,
  type TellThemToSlowDownFacetData,
  type CreditTick,
} from './algorithm.js';
export { tellThemToSlowDownScene, type SlowDownScene, type SlowDownStep } from './scene.js';
export { tellThemToSlowDownStageView } from './tell-them-to-slow-down-stage.js';
export { tellThemToSlowDownIRs } from './irs.js';
export { tellThemToSlowDownFacet } from './facet.js';

export function registerTellThemToSlowDown(): void {
  registerAlgorithm<TellThemToSlowDownFacetData>('tellThemToSlowDown', tellThemToSlowDown, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('tellThemToSlowDownScene', tellThemToSlowDownScene);
  for (const ir of tellThemToSlowDownIRs) registerIR(ir.id, ir);
  registerView('tell-them-to-slow-down-stage', tellThemToSlowDownStageView);
  registerFacets([tellThemToSlowDownFacet]);
}

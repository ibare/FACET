import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { jankVsSlow } from './algorithm.js';
import { jankVsSlowScene } from './scene.js';
import { jankVsSlowIRs } from './irs.js';
import { jankVsSlowStageView } from './jank-vs-slow-stage.js';
import { jankVsSlowFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './jank-vs-slow-stage.js';
export * from './facet.js';

export function registerJankVsSlow(): void {
  registerAlgorithm('jankVsSlow', jankVsSlow, { mechanismKind: 'reactive' });
  registerScenePlan('jankVsSlowScene', jankVsSlowScene);
  for (const ir of jankVsSlowIRs) registerIR(ir.id, ir);
  registerView('jank-vs-slow-stage', jankVsSlowStageView);
  registerFacets([jankVsSlowFacet]);
}

import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { yieldToRender, type YieldToRenderFacetData } from './algorithm.js';
import { yieldToRenderScene } from './scene.js';
import { yieldToRenderIRs } from './irs.js';
import { yieldToRenderStageView } from './yield-to-render-stage.js';
import { yieldToRenderFacet } from './facet.js';

export { yieldToRender, type YieldToRenderFacetData } from './algorithm.js';
export { yieldToRenderScene } from './scene.js';
export type { YieldToRenderScene, YieldToRenderStep } from './scene.js';
export { yieldToRenderIRs } from './irs.js';
export { yieldToRenderStageView } from './yield-to-render-stage.js';
export { yieldToRenderFacet } from './facet.js';

export function registerYieldToRender(): void {
  registerAlgorithm<YieldToRenderFacetData>('yieldToRender', yieldToRender, { mechanismKind: 'reactive' });
  registerScenePlan('yieldToRenderScene', yieldToRenderScene);
  for (const ir of yieldToRenderIRs) registerIR(ir.id, ir);
  registerView('yield-to-render-stage', yieldToRenderStageView);
  registerFacets([yieldToRenderFacet]);
}

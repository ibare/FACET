import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { wDivide, type WDivideFacetData } from './algorithm.js';
import { wDivideScene } from './scene.js';
import { wDivideIRs } from './irs.js';
import { wDivideStageView } from './w-divide-stage.js';
import { wDivideFacet } from './facet.js';

export { wDivide, divideByW, narrowWDivideData } from './algorithm.js';
export type { Bundle, WDivideFacetData } from './algorithm.js';
export { wDivideScene } from './scene.js';
export type { WDivideScene, WDivideStep, WDivideOutcome } from './scene.js';
export { wDivideIRs } from './irs.js';
export { wDivideStageView } from './w-divide-stage.js';
export { wDivideFacet } from './facet.js';

export function registerWDivide(): void {
  registerAlgorithm<WDivideFacetData>('wDivide', wDivide, { mechanismKind: 'reactive' });
  registerScenePlan('wDivideScene', wDivideScene);
  for (const ir of wDivideIRs) registerIR(ir.id, ir);
  registerView('w-divide-stage', wDivideStageView);
  registerFacets([wDivideFacet]);
}

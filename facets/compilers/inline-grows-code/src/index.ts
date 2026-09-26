import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { inlineGrowsCode, type InlineGrowsCodeFacetData } from './algorithm.js';
import { inlineGrowsCodeScene } from './scene.js';
import { inlineGrowsCodeIRs } from './irs.js';
import { inlineGrowsCodeStageView } from './inline-grows-code-stage.js';
import { inlineGrowsCodeFacet } from './facet.js';

export { inlineGrowsCode, type InlineGrowsCodeFacetData } from './algorithm.js';
export { inlineGrowsCodeScene, type InlineGrowsCodeScene } from './scene.js';
export { inlineGrowsCodeIRs } from './irs.js';
export { inlineGrowsCodeStageView } from './inline-grows-code-stage.js';
export { inlineGrowsCodeFacet } from './facet.js';

export function registerInlineGrowsCode(): void {
  registerAlgorithm<InlineGrowsCodeFacetData>('inlineGrowsCode', inlineGrowsCode, { mechanismKind: 'reactive' });
  registerScenePlan('inlineGrowsCodeScene', inlineGrowsCodeScene);
  for (const ir of inlineGrowsCodeIRs) registerIR(ir.id, ir);
  registerView('inline-grows-code-stage', inlineGrowsCodeStageView);
  registerFacets([inlineGrowsCodeFacet]);
}

import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { hardVsSoftLink, type HardVsSoftLinkFacetData } from './algorithm.js';
import { hardVsSoftLinkScene } from './scene.js';
import { hardVsSoftLinkStageView } from './hard-vs-soft-link-stage.js';
import { hardVsSoftLinkIRs } from './irs.js';
import { hardVsSoftLinkFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { hardVsSoftLinkStageView } from './hard-vs-soft-link-stage.js';
export { hardVsSoftLinkIRs } from './irs.js';
export { hardVsSoftLinkFacet } from './facet.js';

export function registerHardVsSoftLink(): void {
  registerAlgorithm<HardVsSoftLinkFacetData>('hardVsSoftLink', hardVsSoftLink, { mechanismKind: 'reactive' });
  registerScenePlan('hardVsSoftLinkScene', hardVsSoftLinkScene);
  for (const ir of hardVsSoftLinkIRs) registerIR(ir.id, ir);
  registerView('hard-vs-soft-link-stage', hardVsSoftLinkStageView);
  registerFacets([hardVsSoftLinkFacet]);
}

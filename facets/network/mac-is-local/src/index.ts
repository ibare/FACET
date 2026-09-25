import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { macIsLocal, type MacIsLocalFacetData } from './algorithm.js';
import { macIsLocalScene } from './scene.js';
import { macIsLocalIRs } from './irs.js';
import { macIsLocalStageView } from './mac-is-local-stage.js';
import { macIsLocalFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './mac-is-local-stage.js';
export * from './facet.js';

export function registerMacIsLocal(): void {
  registerAlgorithm<MacIsLocalFacetData>('macIsLocal', macIsLocal, { mechanismKind: 'reactive' });
  registerScenePlan('macIsLocalScene', macIsLocalScene);
  for (const ir of macIsLocalIRs) registerIR(ir.id, ir);
  registerView('mac-is-local-stage', macIsLocalStageView);
  registerFacets([macIsLocalFacet]);
}

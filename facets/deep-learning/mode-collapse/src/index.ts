import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { modeCollapse, type ModeCollapseFacetData } from './algorithm.js';
import { modeCollapseScene } from './scene.js';
import { modeCollapseStageView } from './mode-collapse-stage.js';
import { modeCollapseIRs } from './irs.js';
import { modeCollapseFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './mode-collapse-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerModeCollapse(): void {
  registerAlgorithm<ModeCollapseFacetData>('modeCollapse', modeCollapse, { mechanismKind: 'reactive' });
  registerScenePlan('modeCollapseScene', modeCollapseScene);
  for (const ir of modeCollapseIRs) registerIR(ir.id, ir);
  registerView('mode-collapse-stage', modeCollapseStageView);
  registerFacets([modeCollapseFacet]);
}

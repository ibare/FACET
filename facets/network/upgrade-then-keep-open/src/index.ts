import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { upgradeThenKeepOpen, type UpgradeThenKeepOpenFacetData } from './algorithm.js';
import { upgradeThenKeepOpenScene } from './scene.js';
import { upgradeThenKeepOpenIRs } from './irs.js';
import { upgradeThenKeepOpenStageView } from './upgrade-then-keep-open-stage.js';
import { upgradeThenKeepOpenFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './upgrade-then-keep-open-stage.js';
export * from './facet.js';

export function registerUpgradeThenKeepOpen(): void {
  registerAlgorithm<UpgradeThenKeepOpenFacetData>('upgradeThenKeepOpen', upgradeThenKeepOpen, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('upgradeThenKeepOpenScene', upgradeThenKeepOpenScene);
  for (const ir of upgradeThenKeepOpenIRs) registerIR(ir.id, ir);
  registerView('upgrade-then-keep-open-stage', upgradeThenKeepOpenStageView);
  registerFacets([upgradeThenKeepOpenFacet]);
}

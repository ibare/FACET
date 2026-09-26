import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { bindsKeyToName, type BindsKeyToNameFacetData } from './algorithm.js';
import { bindsKeyToNameScene } from './scene.js';
import { bindsKeyToNameStageView } from './binds-key-to-name-stage.js';
import { bindsKeyToNameIRs } from './irs.js';
import { bindsKeyToNameFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { bindsKeyToNameStageView } from './binds-key-to-name-stage.js';
export { bindsKeyToNameIRs } from './irs.js';
export { bindsKeyToNameFacet } from './facet.js';

export function registerBindsKeyToName(): void {
  registerAlgorithm<BindsKeyToNameFacetData>('bindsKeyToName', bindsKeyToName, { mechanismKind: 'reactive' });
  registerScenePlan('bindsKeyToNameScene', bindsKeyToNameScene);
  for (const ir of bindsKeyToNameIRs) registerIR(ir.id, ir);
  registerView('binds-key-to-name-stage', bindsKeyToNameStageView);
  registerFacets([bindsKeyToNameFacet]);
}

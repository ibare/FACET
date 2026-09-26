import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { onlyWhatChanged, type OnlyWhatChangedFacetData } from './algorithm.js';
import { onlyWhatChangedScene } from './scene.js';
import { onlyWhatChangedStageView } from './only-what-changed-stage.js';
import { onlyWhatChangedIRs } from './irs.js';
import { onlyWhatChangedFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './only-what-changed-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerOnlyWhatChanged(): void {
  registerAlgorithm<OnlyWhatChangedFacetData>('onlyWhatChanged', onlyWhatChanged, { mechanismKind: 'reactive' });
  registerScenePlan('onlyWhatChangedScene', onlyWhatChangedScene);
  for (const ir of onlyWhatChangedIRs) registerIR(ir.id, ir);
  registerView('only-what-changed-stage', onlyWhatChangedStageView);
  registerFacets([onlyWhatChangedFacet]);
}

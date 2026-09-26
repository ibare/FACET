import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { keepOldVersion, type KeepOldVersionFacetData } from './algorithm.js';
import { keepOldVersionScene } from './scene.js';
import { keepOldVersionStageView } from './keep-old-version-stage.js';
import { keepOldVersionIRs } from './irs.js';
import { keepOldVersionFacet } from './facet.js';

export { keepOldVersion, type KeepOldVersionFacetData, type KeepOldVersionEvent, type Version } from './algorithm.js';
export { keepOldVersionScene, type KeepOldVersionScene, type KeepOldVersionStep } from './scene.js';
export { keepOldVersionStageView } from './keep-old-version-stage.js';
export { keepOldVersionIRs } from './irs.js';
export { keepOldVersionFacet } from './facet.js';

export function registerKeepOldVersion(): void {
  registerAlgorithm<KeepOldVersionFacetData>('keepOldVersion', keepOldVersion, { mechanismKind: 'reactive' });
  registerScenePlan('keepOldVersionScene', keepOldVersionScene);
  for (const ir of keepOldVersionIRs) registerIR(ir.id, ir);
  registerView('keep-old-version-stage', keepOldVersionStageView);
  registerFacets([keepOldVersionFacet]);
}

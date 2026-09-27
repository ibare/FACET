import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { cltBell, type CltBellFacetData } from './algorithm.js';
import { cltBellScene } from './scene.js';
import { cltBellStageView } from './clt-bell-stage.js';
import { cltBellIRs } from './irs.js';
import { cltBellFacet } from './facet.js';

export { cltBell, binCenter, binCountOf, narrowCltBellData } from './algorithm.js';
export type { CltBellFacetData, CrowdPayload } from './algorithm.js';
export { cltBellScene } from './scene.js';
export type { CltBellScene, CltBellStep, Crowd } from './scene.js';
export { cltBellStageView } from './clt-bell-stage.js';
export { cltBellIRs } from './irs.js';
export { cltBellFacet } from './facet.js';

export function registerCltBell(): void {
  registerAlgorithm<CltBellFacetData>('cltBell', cltBell, { mechanismKind: 'reactive' });
  registerScenePlan('cltBellScene', cltBellScene);
  for (const ir of cltBellIRs) registerIR(ir.id, ir);
  registerView('clt-bell-stage', cltBellStageView);
  registerFacets([cltBellFacet]);
}

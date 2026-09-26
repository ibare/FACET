import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { bitPerRow, type BitPerRowFacetData } from './algorithm.js';
import { bitPerRowScene } from './scene.js';
import { bitPerRowStageView } from './bit-per-row-stage.js';
import { bitPerRowIRs } from './irs.js';
import { bitPerRowFacet } from './facet.js';

export { bitPerRow, distinctValues, type BitPerRowFacetData } from './algorithm.js';
export { bitPerRowScene, type BitPerRowScene, type BitPerRowStep } from './scene.js';
export { bitPerRowStageView } from './bit-per-row-stage.js';
export { bitPerRowIRs } from './irs.js';
export { bitPerRowFacet } from './facet.js';

export function registerBitPerRow(): void {
  registerAlgorithm<BitPerRowFacetData>('bitPerRow', bitPerRow, { mechanismKind: 'reactive' });
  registerScenePlan('bitPerRowScene', bitPerRowScene);
  for (const ir of bitPerRowIRs) registerIR(ir.id, ir);
  registerView('bit-per-row-stage', bitPerRowStageView);
  registerFacets([bitPerRowFacet]);
}

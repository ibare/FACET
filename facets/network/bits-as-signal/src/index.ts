import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { bitsAsSignal, type BitsAsSignalFacetData } from './algorithm.js';
import { bitsAsSignalScene } from './scene.js';
import { bitsAsSignalStageView } from './bits-as-signal-stage.js';
import { bitsAsSignalIRs } from './irs.js';
import { bitsAsSignalFacet } from './facet.js';

export { bitsAsSignal, type BitsAsSignalFacetData } from './algorithm.js';
export { bitsAsSignalScene, type BitsAsSignalScene } from './scene.js';
export { bitsAsSignalStageView } from './bits-as-signal-stage.js';
export { bitsAsSignalIRs } from './irs.js';
export { bitsAsSignalFacet } from './facet.js';

export function registerBitsAsSignal(): void {
  registerAlgorithm<BitsAsSignalFacetData>('bitsAsSignal', bitsAsSignal, { mechanismKind: 'reactive' });
  registerScenePlan('bitsAsSignalScene', bitsAsSignalScene);
  for (const ir of bitsAsSignalIRs) registerIR(ir.id, ir);
  registerView('bits-as-signal-stage', bitsAsSignalStageView);
  registerFacets([bitsAsSignalFacet]);
}

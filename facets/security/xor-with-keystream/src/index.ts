import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { xorWithKeystream, type XorWithKeystreamFacetData } from './algorithm.js';
import { xorWithKeystreamScene } from './scene.js';
import { xorWithKeystreamStageView } from './xor-with-keystream-stage.js';
import { xorWithKeystreamIRs } from './irs.js';
import { xorWithKeystreamFacet } from './facet.js';

export { xorWithKeystream, readXorData, popcount } from './algorithm.js';
export type { XorWithKeystreamFacetData, XorStream } from './algorithm.js';
export { xorWithKeystreamScene } from './scene.js';
export type { XorWithKeystreamScene, XorStep, PassTotal } from './scene.js';
export { xorWithKeystreamStageView } from './xor-with-keystream-stage.js';
export { xorWithKeystreamIRs } from './irs.js';
export { xorWithKeystreamFacet } from './facet.js';

export function registerXorWithKeystream(): void {
  registerAlgorithm<XorWithKeystreamFacetData>('xorWithKeystream', xorWithKeystream, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('xorWithKeystreamScene', xorWithKeystreamScene);
  for (const ir of xorWithKeystreamIRs) registerIR(ir.id, ir);
  registerView('xor-with-keystream-stage', xorWithKeystreamStageView);
  registerFacets([xorWithKeystreamFacet]);
}

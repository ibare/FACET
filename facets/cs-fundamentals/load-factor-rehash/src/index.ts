/**
 * @ffacet/algorithm-load-factor-rehash — 적재율과 재해싱 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 아홉 걸음을 자동 재생하고 멈추며, 다시 보기와
 * 한 걸음 두 버튼 외에는 조작을 받지 않는다.
 */

export {
  loadFactorRehash,
  type LoadFactorRehashData,
  type RehashKey,
} from './algorithm.js';
export { loadFactorRehashProjector } from './projector.js';
export { loadFactorRehashIRs } from './irs.js';
export { loadFactorRehashFacet } from './facet.js';
export { loadFactorRehashDescription } from './description.js';
export { loadFactorRehashStageView } from './load-factor-rehash-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { loadFactorRehash, type LoadFactorRehashData } from './algorithm.js';
import { loadFactorRehashProjector } from './projector.js';
import { loadFactorRehashIRs } from './irs.js';
import { loadFactorRehashFacet } from './facet.js';
import { loadFactorRehashDescription } from './description.js';
import { loadFactorRehashStageView } from './load-factor-rehash-stage.js';

export function registerLoadFactorRehash(): void {
  registerAlgorithm<LoadFactorRehashData>('loadFactorRehash', loadFactorRehash, {
    mechanismKind: 'reactive',
  });
  registerProjector('loadFactorRehashProjector', loadFactorRehashProjector);
  for (const ir of loadFactorRehashIRs) registerIR(ir.id, ir);
  registerView('load-factor-rehash-stage', loadFactorRehashStageView);
  registerFacets([loadFactorRehashFacet]);
  registerDescription(loadFactorRehashFacet.id, loadFactorRehashDescription);
}

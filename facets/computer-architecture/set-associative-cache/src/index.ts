import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { setAssociativeCacheAlgorithm, type SetAssociativeCacheData } from './algorithm.js';
import { setAssociativeCacheProjector } from './projector.js';
import { setAssociativeCacheIRs } from './irs.js';
import { setAssociativeCacheStageView } from './set-associative-cache-stage.js';
import { setAssociativeCacheFacet } from './facet.js';
import { setAssociativeCacheDescription } from './description.js';

export {
  setAssociativeCacheAlgorithm,
  countSetAssociativeMisses,
  type SetAssociativeCacheData,
} from './algorithm.js';
export { setAssociativeCacheProjector } from './projector.js';
export {
  setAssociativeCacheIRs,
  setAssociativeCacheImperativeIR,
  SET_ASSOCIATIVE_CACHE_PHASES,
  walkIRStatements,
} from './irs.js';
export { setAssociativeCacheStageView } from './set-associative-cache-stage.js';
export { setAssociativeCacheFacet } from './facet.js';
export { setAssociativeCacheDescription } from './description.js';

/**
 * 이 facet 을 레지스트리에 올린다. 호출 책임은 호스트 앱에 있다.
 *
 * `mechanismKind: 'reactive'` — 손잡이(segmented-slider)가 붙은 완제품이라
 * 그렇다. `CoroutineMechanism.supportedControls` 에는 `'*'` 가 없어서 러너의
 * `assertControlsSupported` 가 마운트 전에 throw 하고, 통과하더라도 그쪽
 * `dispatch` 는 no-op 이라 손잡이가 알고리즘에 닿지 않는다. 선언 자리는
 * `facet.ts` 가 아니라 여기다.
 */
export function registerSetAssociativeCache(): void {
  registerAlgorithm<SetAssociativeCacheData>(
    'setAssociativeCache',
    setAssociativeCacheAlgorithm,
    { mechanismKind: 'reactive' },
  );
  registerProjector('setAssociativeCacheProjector', setAssociativeCacheProjector);
  for (const ir of setAssociativeCacheIRs) registerIR(ir.id, ir);
  registerView('set-associative-cache-stage', setAssociativeCacheStageView);
  registerFacets([setAssociativeCacheFacet]);
  registerDescription(setAssociativeCacheFacet.id, setAssociativeCacheDescription);
}

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { cacheLineAlgorithm, cacheLineRate } from './algorithm.js';
import type { CacheLineData, CacheLineTrack } from './algorithm.js';
import { cacheLineStageView } from './cache-line-stage.js';
import { cacheLineDescription } from './description.js';
import { cacheLineFacet } from './facet.js';
import { cacheLineImperativeIR, cacheLineIRs } from './irs.js';
import { cacheLineProjector } from './projector.js';

export {
  cacheLineAlgorithm,
  cacheLineRate,
  cacheLineStageView,
  cacheLineDescription,
  cacheLineFacet,
  cacheLineImperativeIR,
  cacheLineIRs,
  cacheLineProjector,
};
export type { CacheLineData, CacheLineTrack };

export function registerCacheLine(): void {
  // 손잡이가 달린 화면이라 reactive 다. coroutine 메커니즘은 위젯 액션을
  // supportedControls 에 두지 않아 마운트 전에 던진다.
  registerAlgorithm<CacheLineData>('cacheLine', cacheLineAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('cacheLineProjector', cacheLineProjector);
  for (const ir of cacheLineIRs) registerIR(ir.id, ir);
  registerView('cache-line-stage', cacheLineStageView);
  registerFacets([cacheLineFacet]);
  registerDescription(cacheLineFacet.id, cacheLineDescription);
}

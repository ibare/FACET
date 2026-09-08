/**
 * @ffacet/algorithm-share-prefix-path — 접두사 공유 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 낱말 넷을 자동 재생으로 순서대로 넣고 정지하며,
 * 다시 보기와 한 걸음씩 짚기 외에는 조작을 받지 않는다.
 */

export {
  sharePrefixPathAlgorithm,
  type SharePrefixPathData,
} from './algorithm.js';
export { sharePrefixPathProjector } from './projector.js';
export { sharePrefixPathIRs } from './irs.js';
export { sharePrefixPathFacet } from './facet.js';
export { sharePrefixPathDescription } from './description.js';
export { sharePrefixPathStageView } from './share-prefix-path-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { sharePrefixPathAlgorithm, type SharePrefixPathData } from './algorithm.js';
import { sharePrefixPathProjector } from './projector.js';
import { sharePrefixPathIRs } from './irs.js';
import { sharePrefixPathFacet } from './facet.js';
import { sharePrefixPathDescription } from './description.js';
import { sharePrefixPathStageView } from './share-prefix-path-stage.js';

export function registerSharePrefixPath(): void {
  registerAlgorithm<SharePrefixPathData>('sharePrefixPath', sharePrefixPathAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('sharePrefixPathProjector', sharePrefixPathProjector);
  for (const ir of sharePrefixPathIRs) registerIR(ir.id, ir);
  registerView('share-prefix-path-stage', sharePrefixPathStageView);
  registerFacets([sharePrefixPathFacet]);
  registerDescription(sharePrefixPathFacet.id, sharePrefixPathDescription);
}

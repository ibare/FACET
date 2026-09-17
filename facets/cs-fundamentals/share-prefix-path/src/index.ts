/**
 * @ffacet/algorithm-share-prefix-path — 접두사 공유 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 낱말 넷을 자동 재생으로 순서대로 넣고 정지하며,
 * 다시 보기 단추와 재생 자리를 끄는 띠 외에는 조작을 받지 않는다. 화면은 걸음마다의
 * 장면에서 만들어지므로 (`scene.ts`) 어느 걸음으로 끌어도 같은 그림이 선다.
 */

export {
  sharePrefixPathAlgorithm,
  type SharePrefixPathData,
} from './algorithm.js';
export { sharePrefixPathScene, type SharePrefixPathScene } from './scene.js';
export { sharePrefixPathIRs } from './irs.js';
export { sharePrefixPathFacet } from './facet.js';
export { sharePrefixPathStageView } from './share-prefix-path-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { sharePrefixPathAlgorithm, type SharePrefixPathData } from './algorithm.js';
import { sharePrefixPathScene } from './scene.js';
import { sharePrefixPathIRs } from './irs.js';
import { sharePrefixPathFacet } from './facet.js';
import { sharePrefixPathStageView } from './share-prefix-path-stage.js';

export function registerSharePrefixPath(): void {
  registerAlgorithm<SharePrefixPathData>('sharePrefixPath', sharePrefixPathAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sharePrefixPathScene', sharePrefixPathScene);
  for (const ir of sharePrefixPathIRs) registerIR(ir.id, ir);
  registerView('share-prefix-path-stage', sharePrefixPathStageView);
  registerFacets([sharePrefixPathFacet]);
}

/**
 * @ffacet/algorithm-find-root — 뿌리 찾기 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 세 번의 오름을 자동 재생하고 멈추며, 다시 보기와
 * 걸음 띠 끌기 외에는 조작을 받지 않는다. 화면은 명령이 아니라 **장면**에서
 * 만들어지므로 (`scene.ts`) 어느 걸음으로든 곧장 갈 수 있다 (S-scene).
 */

export { findRootAlgorithm, type FindRootData } from './algorithm.js';
export { findRootScene, type FindRootScene, type FindRootWalk } from './scene.js';
export { findRootIRs } from './irs.js';
export { findRootFacet } from './facet.js';
export { findRootStageView } from './find-root-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { findRootAlgorithm, type FindRootData } from './algorithm.js';
import { findRootScene } from './scene.js';
import { findRootIRs } from './irs.js';
import { findRootFacet } from './facet.js';
import { findRootStageView } from './find-root-stage.js';

export function registerFindRoot(): void {
  registerAlgorithm<FindRootData>('findRoot', findRootAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('findRootScene', findRootScene);
  for (const ir of findRootIRs) registerIR(ir.id, ir);
  registerView('find-root-stage', findRootStageView);
  registerFacets([findRootFacet]);
}

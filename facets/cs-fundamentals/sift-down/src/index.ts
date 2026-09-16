/**
 * sift-down 조각 등록 진입점. 호스트가 명시적으로 호출한다 — 이 모듈은
 * 사이드이펙트로 스스로 등록하지 않는다 (S-facet).
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { siftDownAlgorithm, type SiftDownData } from './algorithm.js';
import { siftDownDescription } from './description.js';
import { siftDownFacet } from './facet.js';
import { siftDownIRs } from './irs.js';
import { siftDownScene } from './scene.js';
import { siftDownStageView } from './sift-down-stage.js';

export { siftDownAlgorithm, type SiftDownData } from './algorithm.js';
export { siftDownDescription } from './description.js';
export { siftDownFacet } from './facet.js';
export { siftDownIRs } from './irs.js';
export { siftDownScene, type SiftDownScene } from './scene.js';
export { siftDownStageView } from './sift-down-stage.js';

export function registerSiftDown(): void {
  registerAlgorithm<SiftDownData>('siftDown', siftDownAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('siftDownScene', siftDownScene);
  for (const ir of siftDownIRs) registerIR(ir.id, ir);
  registerView('sift-down-stage', siftDownStageView);
  registerFacets([siftDownFacet]);
  registerDescription(siftDownFacet.id, siftDownDescription);
}

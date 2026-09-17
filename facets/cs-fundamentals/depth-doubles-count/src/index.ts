/**
 * depth-doubles-count 등록 진입점.
 *
 * `registerDepthDoublesCount()` 는 호스트 앱(bootstrap / playground) 이 부른다.
 * 이 모듈은 import 만으로 아무것도 등록하지 않는다 (S-facet).
 *
 * 걸음마다 화면을 장면(Scene) 으로 잡으므로 띠를 끌어 어느 걸음으로든 갈 수
 * 있다 (S-scene).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { depthDoublesCountAlgorithm } from './algorithm.js';
import type { DepthDoublesCountData } from './algorithm.js';
import { depthDoublesCountScene } from './scene.js';
import { depthDoublesCountIRs } from './irs.js';
import { depthDoublesCountStageView } from './depth-doubles-count-stage.js';
import { depthDoublesCountFacet } from './facet.js';

export { depthDoublesCountAlgorithm } from './algorithm.js';
export type { DepthDoublesCountData } from './algorithm.js';
export {
  depthDoublesCountScene,
  type DepthDoublesCountScene,
  type DepthStep,
} from './scene.js';
export { depthDoublesCountIRs } from './irs.js';
export { depthDoublesCountStageView } from './depth-doubles-count-stage.js';
export { depthDoublesCountFacet } from './facet.js';

export function registerDepthDoublesCount(): void {
  registerAlgorithm<DepthDoublesCountData>('depthDoublesCount', depthDoublesCountAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('depthDoublesCountScene', depthDoublesCountScene);
  for (const ir of depthDoublesCountIRs) registerIR(ir.id, ir);
  registerView('depth-doubles-count-stage', depthDoublesCountStageView);
  registerFacets([depthDoublesCountFacet]);
}

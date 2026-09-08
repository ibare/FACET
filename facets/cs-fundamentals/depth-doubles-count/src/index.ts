/**
 * depth-doubles-count 등록 진입점.
 *
 * `registerDepthDoublesCount()` 는 호스트 앱(bootstrap / playground) 이 부른다.
 * 이 모듈은 import 만으로 아무것도 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { depthDoublesCountAlgorithm } from './algorithm.js';
import type { DepthDoublesCountData } from './algorithm.js';
import { depthDoublesCountProjector } from './projector.js';
import { depthDoublesCountIRs } from './irs.js';
import { depthDoublesCountStageView } from './depth-doubles-count-stage.js';
import { depthDoublesCountFacet } from './facet.js';
import { depthDoublesCountDescription } from './description.js';

export { depthDoublesCountAlgorithm } from './algorithm.js';
export type { DepthDoublesCountData } from './algorithm.js';
export { depthDoublesCountProjector } from './projector.js';
export { depthDoublesCountIRs } from './irs.js';
export { depthDoublesCountStageView } from './depth-doubles-count-stage.js';
export { depthDoublesCountFacet } from './facet.js';
export { depthDoublesCountDescription } from './description.js';

export function registerDepthDoublesCount(): void {
  registerAlgorithm<DepthDoublesCountData>('depthDoublesCount', depthDoublesCountAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('depthDoublesCount', depthDoublesCountProjector);
  for (const ir of depthDoublesCountIRs) registerIR(ir.id, ir);
  registerView('depth-doubles-count-stage', depthDoublesCountStageView);
  registerFacets([depthDoublesCountFacet]);
  registerDescription(depthDoublesCountFacet.id, depthDoublesCountDescription);
}

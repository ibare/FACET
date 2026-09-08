/**
 * sift-down 조각 등록 진입점. 호스트가 명시적으로 호출한다 — 이 모듈은
 * 사이드이펙트로 스스로 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { siftDownAlgorithm, type SiftDownData } from './algorithm.js';
import { siftDownDescription } from './description.js';
import { siftDownFacet } from './facet.js';
import { siftDownIRs } from './irs.js';
import { siftDownProjector } from './projector.js';
import { siftDownStageView } from './sift-down-stage.js';

export { siftDownAlgorithm, type SiftDownData } from './algorithm.js';
export { siftDownDescription } from './description.js';
export { siftDownFacet } from './facet.js';
export { siftDownIRs } from './irs.js';
export { siftDownProjector } from './projector.js';
export { siftDownStageView } from './sift-down-stage.js';

export function registerSiftDown(): void {
  registerAlgorithm<SiftDownData>('siftDown', siftDownAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('siftDownProjector', siftDownProjector);
  for (const ir of siftDownIRs) registerIR(ir.id, ir);
  registerView('sift-down-stage', siftDownStageView);
  registerFacets([siftDownFacet]);
  registerDescription(siftDownFacet.id, siftDownDescription);
}

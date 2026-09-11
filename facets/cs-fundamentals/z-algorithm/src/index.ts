/**
 * @ffacet/algorithm-z-algorithm — 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다. 부르는 책임은 호스트 앱에 있다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { zAlgorithmAlgorithm, type ZAlgorithmData } from './algorithm.js';
import { zAlgorithmProjector } from './projector.js';
import { zAlgorithmIRs } from './irs.js';
import { zAlgorithmStageView } from './z-algorithm-stage.js';
import { zAlgorithmFacet } from './facet.js';
import { zAlgorithmDescription } from './description.js';

export {
  zAlgorithmAlgorithm,
  zAlgorithmProjector,
  zAlgorithmIRs,
  zAlgorithmStageView,
  zAlgorithmFacet,
  zAlgorithmDescription,
};
export { zTrace, naiveZ, zHits, joinedOf } from './algorithm.js';
export { zAlgorithmImperativeIR } from './irs.js';
export type { ZAlgorithmData, ZStep, ZTrace } from './algorithm.js';

export function registerZAlgorithm(): void {
  // 손잡이가 있는 완제품은 reactive 다 — 독자가 미는 것이 곧 다음 단이다.
  registerAlgorithm<ZAlgorithmData>('zAlgorithm', zAlgorithmAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('zAlgorithmProjector', zAlgorithmProjector);
  for (const ir of zAlgorithmIRs) registerIR(ir.id, ir);
  registerView('z-algorithm-stage', zAlgorithmStageView);
  registerFacets([zAlgorithmFacet]);
  registerDescription(zAlgorithmFacet.id, zAlgorithmDescription);
}

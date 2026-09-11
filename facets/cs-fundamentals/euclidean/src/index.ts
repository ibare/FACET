/**
 * @ffacet/algorithm-euclidean — 등록 진입점.
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { euclideanAlgorithm, type EuclideanData } from './algorithm.js';
import { euclideanProjector } from './projector.js';
import { euclideanIRs } from './irs.js';
import { euclideanStageView } from './euclidean-stage.js';
import { euclideanFacet } from './facet.js';
import { euclideanDescription } from './description.js';

export {
  euclideanAlgorithm,
  euclideanProjector,
  euclideanIRs,
  euclideanStageView,
  euclideanFacet,
  euclideanDescription,
};
export { euclideanSteps } from './algorithm.js';
export { euclideanImperativeIR } from './irs.js';
export type { EuclideanData, EuclideanStep } from './algorithm.js';

export function registerEuclidean(): void {
  // 손잡이가 있는 완제품은 reactive 다 — 독자가 미는 것이 곧 다음 판이다.
  registerAlgorithm<EuclideanData>('euclidean', euclideanAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('euclideanProjector', euclideanProjector);
  for (const ir of euclideanIRs) registerIR(ir.id, ir);
  registerView('euclidean-stage', euclideanStageView);
  registerFacets([euclideanFacet]);
  registerDescription(euclideanFacet.id, euclideanDescription);
}

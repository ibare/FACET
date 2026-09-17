/**
 * @ffacet/algorithm-big-o — 등록 진입점.
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { bigOAlgorithm, type BigOData } from './algorithm.js';
import { bigOProjector } from './projector.js';
import { bigOIRs } from './irs.js';
import { bigOStageView } from './big-o-stage.js';
import { bigOFacet } from './facet.js';

export { bigOAlgorithm, bigOProjector, bigOIRs, bigOStageView, bigOFacet };
export { bigORung, rungIndex } from './algorithm.js';
export { bigOImperativeIR } from './irs.js';
export type { BigOData, BigORung } from './algorithm.js';
export type { RungStep } from './projector.js';

export function registerBigO(): void {
  // 손잡이가 있는 완제품은 reactive 다 — 독자가 미는 것이 곧 다음 판이다.
  registerAlgorithm<BigOData>('bigO', bigOAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('bigOProjector', bigOProjector);
  for (const ir of bigOIRs) registerIR(ir.id, ir);
  registerView('big-o-stage', bigOStageView);
  registerFacets([bigOFacet]);
}

/**
 * @ffacet/algorithm-unrepresentable-fraction — 끝나지 않는 소수 조각(piece) 번들.
 *
 * 한 주장을 말하는 조각이다. 자동으로 재생되고 멈추며, 다시 보기와 한 걸음만
 * 받는다. ReactiveMechanism 이라 스스로 재생을 시작하고 걸음 간격도 스스로
 * 정한다 (ctx.sleep). 코드 패널은 두지 않는다.
 *
 * 등록 호출은 호스트 앱의 몫이다 — 이 모듈은 사이드 이펙트로 자기를 등록하지
 * 않는다 (S-facet).
 */

export { unrepresentableFraction, type UnrepresentableFractionData } from './algorithm.js';
export { unrepresentableFractionProjector } from './projector.js';
export { unrepresentableFractionIRs } from './irs.js';
export { unrepresentableFractionFacet } from './facet.js';
export { unrepresentableFractionDescription } from './description.js';
export { unrepresentableFractionStageView } from './unrepresentable-fraction-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { unrepresentableFraction, type UnrepresentableFractionData } from './algorithm.js';
import { unrepresentableFractionProjector } from './projector.js';
import { unrepresentableFractionIRs } from './irs.js';
import { unrepresentableFractionFacet } from './facet.js';
import { unrepresentableFractionDescription } from './description.js';
import { unrepresentableFractionStageView } from './unrepresentable-fraction-stage.js';

export function registerUnrepresentableFraction(): void {
  registerAlgorithm<UnrepresentableFractionData>('unrepresentableFraction', unrepresentableFraction, {
    mechanismKind: 'reactive',
  });
  registerProjector('unrepresentableFractionProjector', unrepresentableFractionProjector);
  for (const ir of unrepresentableFractionIRs) registerIR(ir.id, ir);
  registerView('unrepresentable-fraction-stage', unrepresentableFractionStageView);
  registerFacets([unrepresentableFractionFacet]);
  registerDescription(unrepresentableFractionFacet.id, unrepresentableFractionDescription);
}

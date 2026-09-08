/**
 * @ffacet/algorithm-pivot-choice-matters — 조각(piece) facet 번들.
 *
 * 기준을 어디서 고르느냐가 남는 일의 크기를 정한다는 주장 하나를 그린다.
 * reactive 로 mount 즉시 한 바퀴 자동 재생하고, 그 뒤 `advance` 로 한 걸음씩
 * 다시 짚을 수 있다.
 *
 * 등록 호출은 호스트 앱의 책임이다 (사이드 이펙트로 부르지 않는다).
 */

export {
  pivotChoiceMatters,
  type PivotChoiceMattersData,
  type PivotTrial,
} from './algorithm.js';
export { pivotChoiceMattersProjector } from './projector.js';
export { pivotChoiceMattersIRs } from './irs.js';
export { pivotChoiceMattersFacet } from './facet.js';
export { pivotChoiceMattersDescription } from './description.js';
export { pivotChoiceMattersStageView } from './pivot-choice-matters-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { pivotChoiceMatters, type PivotChoiceMattersData } from './algorithm.js';
import { pivotChoiceMattersProjector } from './projector.js';
import { pivotChoiceMattersIRs } from './irs.js';
import { pivotChoiceMattersFacet } from './facet.js';
import { pivotChoiceMattersDescription } from './description.js';
import { pivotChoiceMattersStageView } from './pivot-choice-matters-stage.js';

/**
 * algorithm / projector / IR / view / facet / description 등록 헬퍼.
 *
 * 등록 순서는 S-facet 표준. 전용 View 는 Facets 직전에 끼운다 — facet JSON 의
 * block.type 이 마운트 시 카탈로그를 조회하기 때문.
 */
export function registerPivotChoiceMatters(): void {
  registerAlgorithm<PivotChoiceMattersData>('pivotChoiceMatters', pivotChoiceMatters, {
    mechanismKind: 'reactive',
  });
  registerProjector('pivotChoiceMattersProjector', pivotChoiceMattersProjector);
  for (const ir of pivotChoiceMattersIRs) registerIR(ir.id, ir);
  registerView('pivot-choice-matters-stage', pivotChoiceMattersStageView);
  registerFacets([pivotChoiceMattersFacet]);
  registerDescription(pivotChoiceMattersFacet.id, pivotChoiceMattersDescription);
}

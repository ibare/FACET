/**
 * @ffacet/algorithm-logistic-regression — 로지스틱 회귀 facet 번들.
 *
 * ReactiveMechanism. 마운트 직후 스스로 학습을 재생하고, 다 배운 뒤에도
 * 결정 문턱 입력을 계속 받는다 — 문턱은 학습이 정하는 값이 아니라 읽는 이가
 * 고르는 값이기 때문이다.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 묶고 등록 헬퍼를 낸다. 등록 호출 책임은 호스트 앱에 있다.
 */

export {
  logisticRegression,
  type LogisticPoint,
  type LogisticRegressionData,
} from './algorithm.js';
export { logisticRegressionProjector } from './projector.js';
export {
  logisticRegressionIRs,
  logisticRegressionTrainStepIR,
} from './irs.js';
export { logisticRegressionFacet } from './facet.js';
export { logisticRegressionDescription } from './description.js';
export {
  logisticRegressionStageView,
  type LogisticStageFrame,
  type LogisticStagePoint,
} from './logistic-regression-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { logisticRegression, type LogisticRegressionData } from './algorithm.js';
import { logisticRegressionProjector } from './projector.js';
import { logisticRegressionIRs } from './irs.js';
import { logisticRegressionFacet } from './facet.js';
import { logisticRegressionDescription } from './description.js';
import { logisticRegressionStageView } from './logistic-regression-stage.js';

export function registerLogisticRegression(): void {
  registerAlgorithm<LogisticRegressionData>('logisticRegression', logisticRegression, {
    mechanismKind: 'reactive',
  });
  registerProjector('logisticRegressionProjector', logisticRegressionProjector);
  for (const ir of logisticRegressionIRs) registerIR(ir.id, ir);
  registerView('logistic-regression-stage', logisticRegressionStageView);
  registerFacets([logisticRegressionFacet]);
  registerDescription(logisticRegressionFacet.id, logisticRegressionDescription);
}

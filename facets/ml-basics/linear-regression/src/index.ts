/**
 * @facet/algorithm-linear-regression — 선형 회귀 (linear regression) facet 번들.
 *
 * 시간 진행형 (ReactiveMechanism + 자동 시연 + pollInput 인터럽트). mount 직후
 * 한 호흡 자동 시연 (수렴 또는 발산까지) 후 idle. 컨트롤바는 play / pause /
 * step / reset + 학습률 segmented-slider (느림 / 적정 / 발산).
 *
 * algorithm / projector / facet JSON / description / 전용 view
 * (linear-regression-stage) 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은
 * 1차 구현에서 생략.
 */

export {
  linearRegression,
  type LinearRegressionData,
  type LinearRegressionInputEvent,
  type Point,
  type LrSegment,
} from './algorithm.js';
export { linearRegressionProjector } from './projector.js';
export { linearRegressionIRs } from './irs.js';
export { linearRegressionFacet } from './facet.js';
export { linearRegressionDescription } from './description.js';
export { linearRegressionStageView } from './linear-regression-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { linearRegression, type LinearRegressionData } from './algorithm.js';
import { linearRegressionProjector } from './projector.js';
import { linearRegressionIRs } from './irs.js';
import { linearRegressionFacet } from './facet.js';
import { linearRegressionDescription } from './description.js';
import { linearRegressionStageView } from './linear-regression-stage.js';

export function registerLinearRegression(): void {
  registerAlgorithm<LinearRegressionData>('linearRegression', linearRegression, {
    mechanismKind: 'reactive',
  });
  registerProjector('linearRegressionProjector', linearRegressionProjector);
  for (const ir of linearRegressionIRs) registerIR(ir.id, ir);
  registerView('linear-regression-stage', linearRegressionStageView);
  registerFacets([linearRegressionFacet]);
  registerDescription(linearRegressionFacet.id, linearRegressionDescription);
}

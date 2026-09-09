/**
 * @ffacet/algorithm-fewer-hops-not-shorter — 가중 그래프의 경로 길이 조각(piece).
 *
 * 한 주장을 말하고 멈춘다. 자동으로 한 바퀴 재생하고, 다시 보기 · 한 걸음 두
 * 버튼 외에는 조작을 받지 않는다. 등록 호출 책임은 호스트 앱에 있다.
 */

export {
  fewerHopsNotShorterAlgorithm,
  type FewerHopsNotShorterData,
} from './algorithm.js';
export { fewerHopsNotShorterProjector } from './projector.js';
export { fewerHopsNotShorterIRs } from './irs.js';
export { fewerHopsNotShorterFacet } from './facet.js';
export { fewerHopsNotShorterDescription } from './description.js';
export { fewerHopsNotShorterStageView } from './fewer-hops-not-shorter-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { fewerHopsNotShorterAlgorithm, type FewerHopsNotShorterData } from './algorithm.js';
import { fewerHopsNotShorterProjector } from './projector.js';
import { fewerHopsNotShorterIRs } from './irs.js';
import { fewerHopsNotShorterFacet } from './facet.js';
import { fewerHopsNotShorterDescription } from './description.js';
import { fewerHopsNotShorterStageView } from './fewer-hops-not-shorter-stage.js';

export function registerFewerHopsNotShorter(): void {
  registerAlgorithm<FewerHopsNotShorterData>('fewerHopsNotShorter', fewerHopsNotShorterAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('fewerHopsNotShorterProjector', fewerHopsNotShorterProjector);
  for (const ir of fewerHopsNotShorterIRs) registerIR(ir.id, ir);
  registerView('fewer-hops-not-shorter-stage', fewerHopsNotShorterStageView);
  registerFacets([fewerHopsNotShorterFacet]);
  registerDescription(fewerHopsNotShorterFacet.id, fewerHopsNotShorterDescription);
}

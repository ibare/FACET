/**
 * @ffacet/algorithm-fewer-hops-not-shorter — 가중 그래프의 경로 길이 조각(piece).
 *
 * 한 주장을 말하고 멈춘다. 자동으로 한 바퀴 재생하고, 다시 보기 · 걸음 띠 외에는
 * 조작을 받지 않는다. 등록 호출 책임은 호스트 앱에 있다.
 */

export {
  fewerHopsNotShorterAlgorithm,
  type FewerHopsNotShorterData,
} from './algorithm.js';
export { fewerHopsNotShorterScene, type FewerHopsNotShorterScene } from './scene.js';
export { fewerHopsNotShorterIRs } from './irs.js';
export { fewerHopsNotShorterFacet } from './facet.js';
export { fewerHopsNotShorterStageView } from './fewer-hops-not-shorter-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { fewerHopsNotShorterAlgorithm, type FewerHopsNotShorterData } from './algorithm.js';
import { fewerHopsNotShorterScene } from './scene.js';
import { fewerHopsNotShorterIRs } from './irs.js';
import { fewerHopsNotShorterFacet } from './facet.js';
import { fewerHopsNotShorterStageView } from './fewer-hops-not-shorter-stage.js';

export function registerFewerHopsNotShorter(): void {
  registerAlgorithm<FewerHopsNotShorterData>('fewerHopsNotShorter', fewerHopsNotShorterAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('fewerHopsNotShorterScene', fewerHopsNotShorterScene);
  for (const ir of fewerHopsNotShorterIRs) registerIR(ir.id, ir);
  registerView('fewer-hops-not-shorter-stage', fewerHopsNotShorterStageView);
  registerFacets([fewerHopsNotShorterFacet]);
}

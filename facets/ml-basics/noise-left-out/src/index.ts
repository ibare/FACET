/**
 * 잡음점 조각의 등록 진입점.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). 부르는 책임은 호스트에 있다 — 여기서 사이드 이펙트로 부르지 않는다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { noiseLeftOutAlgorithm, type NoiseLeftOutData } from './algorithm.js';
import { noiseLeftOutDescription } from './description.js';
import { noiseLeftOutFacet } from './facet.js';
import { noiseLeftOutIRs } from './irs.js';
import { noiseLeftOutStageView } from './noise-left-out-stage.js';
import { noiseLeftOutScene } from './scene.js';

export { noiseLeftOutAlgorithm } from './algorithm.js';
export type { NoiseLeftOutData, NoisePoint } from './algorithm.js';
export { noiseLeftOutDescription } from './description.js';
export { noiseLeftOutFacet } from './facet.js';
export { noiseLeftOutIRs } from './irs.js';
export { noiseLeftOutStageView } from './noise-left-out-stage.js';
export {
  noiseLeftOutScene,
  type ClaimMark,
  type NoiseLeftOutScene,
  type NoiseStep,
  type ScenePoint,
  type Wave,
} from './scene.js';

export function registerNoiseLeftOut(): void {
  registerAlgorithm<NoiseLeftOutData>('noiseLeftOut', noiseLeftOutAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('noiseLeftOutScene', noiseLeftOutScene);
  for (const ir of noiseLeftOutIRs) registerIR(ir.id, ir);
  registerView('noise-left-out-stage', noiseLeftOutStageView);
  registerFacets([noiseLeftOutFacet]);
  registerDescription(noiseLeftOutFacet.id, noiseLeftOutDescription);
}

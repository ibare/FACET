/**
 * 등록 진입점. 호스트 앱이 부른다 — 이 파일은 사이드 이펙트로 스스로 부르지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { angleNotLengthAlgorithm } from './algorithm.js';
import { angleNotLengthStageView } from './angle-not-length-stage.js';
import { angleNotLengthFacet } from './facet.js';
import { angleNotLengthIRs } from './irs.js';
import { angleNotLengthScene } from './scene.js';

export {
  angleNotLengthAlgorithm,
  readAngleCandidates,
  readAngleQuery,
  vectorLength,
} from './algorithm.js';
export type { AngleNotLengthData, AngleNotLengthPoint } from './algorithm.js';
export { angleNotLengthStageView } from './angle-not-length-stage.js';
export { angleNotLengthFacet } from './facet.js';
export { angleNotLengthIRs } from './irs.js';
export { angleNotLengthScene, flipOf, focusOf, lastSweptOf, lengthOf, rankIn } from './scene.js';
export type {
  AngleFocus,
  AngleNotLengthScene,
  AngleNotLengthStep,
  AngleReading,
} from './scene.js';

export function registerAngleNotLength(): void {
  // 조각은 스스로 시작하고 걸음 간격도 스스로 정해야 한다. 둘 다 reactive 만 준다
  // (S-piece). 선언하는 자리는 facet.ts 가 아니라 여기다.
  registerAlgorithm('angleNotLength', angleNotLengthAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('angleNotLengthScene', angleNotLengthScene);
  for (const ir of angleNotLengthIRs) registerIR(ir.id, ir);
  registerView('angle-not-length-stage', angleNotLengthStageView);
  registerFacets([angleNotLengthFacet]);
}

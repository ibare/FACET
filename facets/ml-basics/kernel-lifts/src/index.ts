/**
 * @ffacet/algorithm-kernel-lifts — 커널 트릭 조각(piece) 번들.
 *
 * mount 하면 스스로 재생한다 (reactive). 컨트롤은 다시 보기와 재생 위치를 끌어 보는
 * 띠 둘뿐이고 둘 다 눌러야 완성되는 조작이 아니다 — 지나가며 보기만 해도 화면은 할
 * 말을 마친다 (S-piece).
 *
 * 화면은 장면(Scene) 으로 만든다. projector 대신 `ScenePlan` 을 등록하고 stage 가
 * 그것을 그린다 (S-scene).
 *
 * `register*` 는 호출하지 않는다. 부르는 것은 호스트 앱의 몫이다 (S-facet).
 */

export {
  kernelLifts,
  kernelCutsOf,
  type KernelLiftsData,
  type KernelLiftsPointSpec,
} from './algorithm.js';
export { kernelLiftsIRs } from './irs.js';
export { kernelLiftsFacet } from './facet.js';
export { kernelLiftsDescription } from './description.js';
export {
  kernelLiftsScene,
  cutAt,
  cutCountOf,
  cutsOf,
  labelsOf,
  lastRiseOf,
  liftedHeightOf,
  sidesOf,
  splitOf,
  type KernelLiftsScene,
  type KernelPoint,
  type KernelRise,
  type KernelStep,
} from './scene.js';
export { kernelLiftsStageView } from './kernel-lifts-stage.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { kernelLifts, type KernelLiftsData } from './algorithm.js';
import { kernelLiftsIRs } from './irs.js';
import { kernelLiftsFacet } from './facet.js';
import { kernelLiftsDescription } from './description.js';
import { kernelLiftsScene } from './scene.js';
import { kernelLiftsStageView } from './kernel-lifts-stage.js';

export function registerKernelLifts(): void {
  registerAlgorithm<KernelLiftsData>('kernelLifts', kernelLifts, {
    mechanismKind: 'reactive',
  });
  // 장면 이름은 algorithm 과 겹치지 않는다 — `module:` 참조가 어느 쪽인지
  // 말하지 못하게 된다 (C4, packages/core/test/register-names.test.ts).
  registerScenePlan('kernelLiftsScene', kernelLiftsScene);
  for (const ir of kernelLiftsIRs) registerIR(ir.id, ir);
  registerView('kernel-lifts-stage', kernelLiftsStageView);
  registerFacets([kernelLiftsFacet]);
  registerDescription(kernelLiftsFacet.id, kernelLiftsDescription);
}

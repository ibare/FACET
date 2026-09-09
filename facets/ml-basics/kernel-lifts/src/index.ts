/**
 * @ffacet/algorithm-kernel-lifts — 커널 트릭 조각(piece) 번들.
 *
 * mount 하면 스스로 재생한다 (reactive). 컨트롤은 다시 보기와 한 걸음 둘뿐이고
 * 둘 다 눌러야 완성되는 조작이 아니다 — 지나가며 보기만 해도 화면은 할 말을
 * 마친다 (S-piece).
 *
 * `register*` 는 호출하지 않는다. 부르는 것은 호스트 앱의 몫이다 (S-facet).
 */

export {
  kernelLifts,
  type KernelLiftsData,
  type KernelLiftsPointSpec,
} from './algorithm.js';
export { kernelLiftsProjector } from './projector.js';
export { kernelLiftsIRs } from './irs.js';
export { kernelLiftsFacet } from './facet.js';
export { kernelLiftsDescription } from './description.js';
export {
  kernelLiftsStageView,
  readKernelLiftsPoints,
  type KernelLiftsPoint,
  type KernelLiftsStage,
} from './kernel-lifts-stage.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { kernelLifts, type KernelLiftsData } from './algorithm.js';
import { kernelLiftsProjector } from './projector.js';
import { kernelLiftsIRs } from './irs.js';
import { kernelLiftsFacet } from './facet.js';
import { kernelLiftsDescription } from './description.js';
import { kernelLiftsStageView } from './kernel-lifts-stage.js';

export function registerKernelLifts(): void {
  registerAlgorithm<KernelLiftsData>('kernelLifts', kernelLifts, {
    mechanismKind: 'reactive',
  });
  registerProjector('kernelLiftsProjector', kernelLiftsProjector);
  for (const ir of kernelLiftsIRs) registerIR(ir.id, ir);
  registerView('kernel-lifts-stage', kernelLiftsStageView);
  registerFacets([kernelLiftsFacet]);
  registerDescription(kernelLiftsFacet.id, kernelLiftsDescription);
}

/**
 * @ffacet/algorithm-constant-fades — 상수 배수를 왜 지우는지 말하는 조각(piece) facet.
 *
 * 아홉 걸음을 자동 재생하고 멎는다. ReactiveMechanism 이라 컨트롤바 없이 스스로
 * 재생하고 걸음 간격도 스스로 정한다 (ctx.sleep). 다시 보기와 띠는 놓친 사람과
 * 곱씹는 사람을 위한 것이지 진행에 필요한 조작이 아니다.
 *
 * algorithm / 장면 설계 / facet JSON / 전용 view (constant-fades-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 두지 않는다.
 *
 * 등록 호출은 호스트 앱의 몫이다 — 이 모듈은 사이드 이펙트로 스스로 등록하지 않는다.
 */

export {
  constantFades,
  linearValueAt,
  quadValueAt,
  type ConstantFadesData,
} from './algorithm.js';
export {
  constantFadesScene,
  type ConstantFadesScene,
  type ConstantFadesStep,
  type BoundaryPost,
  type ProbeMark,
} from './scene.js';
export { constantFadesIRs } from './irs.js';
export { constantFadesFacet } from './facet.js';
export { constantFadesStageView } from './constant-fades-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { constantFades, type ConstantFadesData } from './algorithm.js';
import { constantFadesScene } from './scene.js';
import { constantFadesIRs } from './irs.js';
import { constantFadesFacet } from './facet.js';
import { constantFadesStageView } from './constant-fades-stage.js';

export function registerConstantFades(): void {
  registerAlgorithm<ConstantFadesData>('constantFades', constantFades, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('constantFadesScene', constantFadesScene);
  for (const ir of constantFadesIRs) registerIR(ir.id, ir);
  registerView('constant-fades-stage', constantFadesStageView);
  registerFacets([constantFadesFacet]);
}

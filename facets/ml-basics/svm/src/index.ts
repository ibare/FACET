/**
 * @ffacet/algorithm-svm — 선형 SVM (소프트 마진) facet 번들.
 *
 * ReactiveMechanism. mount 직후 4000 걸음을 열여섯 자리에서 짚어 보이고,
 * 마지막 한 걸음은 점 하나하나를 훑는다. 그 뒤로는 C 슬라이더(0.1 / 1 / 10)와
 * 겹침 토글을 기다리며, 손잡이가 움직이면 그 값으로 다시 훈련한 결과만 갈아
 * 끼운다.
 *
 * algorithm / projector / IR (`ir:svm`) / facet JSON / description / 전용 view
 * (`svm-stage`) 를 함께 번들하고 등록 헬퍼를 제공한다. 등록 호출의 책임은
 * 호스트 앱에 있다 (S-facet).
 */

export { svm, type SvmData, type SvmInputEvent, type SvmPoint, type SvmTimings } from './algorithm.js';
export { svmProjector } from './projector.js';
export { svmIRs, svmStepIR } from './irs.js';
export { svmFacet } from './facet.js';
export { svmDescription } from './description.js';
export { svmStageView, type StagePoint } from './svm-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { svm, type SvmData } from './algorithm.js';
import { svmProjector } from './projector.js';
import { svmIRs } from './irs.js';
import { svmFacet } from './facet.js';
import { svmDescription } from './description.js';
import { svmStageView } from './svm-stage.js';

export function registerSvm(): void {
  registerAlgorithm<SvmData>('svm', svm, { mechanismKind: 'reactive' });
  registerProjector('svmProjector', svmProjector);
  for (const ir of svmIRs) registerIR(ir.id, ir);
  registerView('svm-stage', svmStageView);
  registerFacets([svmFacet]);
  registerDescription(svmFacet.id, svmDescription);
}

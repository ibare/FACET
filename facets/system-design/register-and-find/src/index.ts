import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
// 알고리즘 함수 이름이 register 로 시작한다 — 검사기가 register* 를 등록 함수로 부르므로 다시 내보내지 않는다
import { registerAndFind, type RegisterAndFindFacetData } from './algorithm.js';
import { registerAndFindScene } from './scene.js';
import { registerAndFindStageView } from './register-and-find-stage.js';
import { registerAndFindIRs } from './irs.js';
import { registerAndFindFacet } from './facet.js';

export { narrowRegisterAndFindData } from './algorithm.js';
export type { RegisterAndFindFacetData, RegisterAndFindInstance, Happening, LookupEntry } from './algorithm.js';
export { registerAndFindScene } from './scene.js';
export type { RegisterAndFindScene, RegisterAndFindStep, RegistryRow, Answer, InstanceState } from './scene.js';
export { registerAndFindStageView } from './register-and-find-stage.js';
export { registerAndFindIRs } from './irs.js';
export { registerAndFindFacet } from './facet.js';

export function registerRegisterAndFind(): void {
  registerAlgorithm<RegisterAndFindFacetData>('registerAndFind', registerAndFind, { mechanismKind: 'reactive' });
  registerScenePlan('registerAndFindScene', registerAndFindScene);
  for (const ir of registerAndFindIRs) registerIR(ir.id, ir);
  registerView('register-and-find-stage', registerAndFindStageView);
  registerFacets([registerAndFindFacet]);
}

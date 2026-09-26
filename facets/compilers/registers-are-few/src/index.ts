import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { registersAreFew, type RegistersAreFewFacetData } from './algorithm.js';
import { registersAreFewScene } from './scene.js';
import { registersAreFewIRs } from './irs.js';
import { registersAreFewStageView } from './registers-are-few-stage.js';
import { registersAreFewFacet } from './facet.js';

// 알고리즘 함수 `registersAreFew` 는 다시 내보내지 않는다 — 이름이 `register` 로 시작해
// 전수 검사가 모듈의 register* 함수를 등록 함수로 여기고 인자 없이 부른다. 등록은 아래 함수가 한다.
export {
  formatInstr,
  readRegistersData,
  regNames,
  type Instr,
  type Op,
  type RegistersAreFewFacetData,
} from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './registers-are-few-stage.js';
export * from './facet.js';

export function registerRegistersAreFew(): void {
  registerAlgorithm<RegistersAreFewFacetData>('registersAreFew', registersAreFew, { mechanismKind: 'reactive' });
  registerScenePlan('registersAreFewScene', registersAreFewScene);
  for (const ir of registersAreFewIRs) registerIR(ir.id, ir);
  registerView('registers-are-few-stage', registersAreFewStageView);
  registerFacets([registersAreFewFacet]);
}

/**
 * @ffacet/algorithm-global-and-local — 전역과 지역 구조 조각(piece) 번들.
 *
 * mount 하면 스스로 재생한다 (reactive). 컨트롤은 다시 보기와 한 걸음 둘뿐이고
 * 둘 다 눌러야 완성되는 조작이 아니다 — 지나가며 보기만 해도 화면은 할 말을
 * 마친다 (S-piece).
 *
 * `register*` 는 호출하지 않는다. 부르는 것은 호스트 앱의 몫이다 (S-facet).
 */

export {
  globalAndLocalAlgorithm,
  type GlobalAndLocalData,
  type GlobalAndLocalGroupSpec,
  type GlobalAndLocalPointSpec,
} from './algorithm.js';
export { globalAndLocalProjector } from './projector.js';
export { globalAndLocalIRs } from './irs.js';
export { globalAndLocalFacet } from './facet.js';
export { globalAndLocalDescription } from './description.js';
export {
  globalAndLocalStageView,
  readGlobalAndLocalScene,
  type GlobalAndLocalGroupShift,
  type GlobalAndLocalPlacedCentroid,
  type GlobalAndLocalPlacedPoint,
  type GlobalAndLocalRow,
  type GlobalAndLocalRulerRow,
  type GlobalAndLocalScene,
  type GlobalAndLocalStage,
} from './global-and-local-stage.js';

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { globalAndLocalAlgorithm, type GlobalAndLocalData } from './algorithm.js';
import { globalAndLocalProjector } from './projector.js';
import { globalAndLocalIRs } from './irs.js';
import { globalAndLocalFacet } from './facet.js';
import { globalAndLocalDescription } from './description.js';
import { globalAndLocalStageView } from './global-and-local-stage.js';

export function registerGlobalAndLocal(): void {
  registerAlgorithm<GlobalAndLocalData>('globalAndLocal', globalAndLocalAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('globalAndLocalProjector', globalAndLocalProjector);
  for (const ir of globalAndLocalIRs) registerIR(ir.id, ir);
  registerView('global-and-local-stage', globalAndLocalStageView);
  registerFacets([globalAndLocalFacet]);
  registerDescription(globalAndLocalFacet.id, globalAndLocalDescription);
}

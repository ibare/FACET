/**
 * @ffacet/algorithm-global-and-local — 전역과 지역 구조 조각(piece) 번들.
 *
 * mount 하면 스스로 재생한다 (reactive). 화면은 명령이 아니라 **장면**에서
 * 만들어지므로 어느 걸음으로든 곧장 갈 수 있다 (S-scene).
 *
 * `register*` 는 호출하지 않는다. 부르는 것은 호스트 앱의 몫이다 (S-facet).
 */

export {
  globalAndLocalAlgorithm,
  type GlobalAndLocalData,
  type GlobalAndLocalGroupSpec,
  type GlobalAndLocalPointSpec,
} from './algorithm.js';
export { globalAndLocalIRs } from './irs.js';
export { globalAndLocalFacet } from './facet.js';
export { globalAndLocalStageView } from './global-and-local-stage.js';
export {
  GLOBAL_AND_LOCAL_ROWS,
  globalAndLocalScene,
  type Flattening,
  type GlobalAndLocalRow,
  type GlobalAndLocalScene,
  type GlobalAndLocalStep,
  type SceneBasePoint,
  type SceneGroup,
  type SpreadCentroid,
  type SpreadPlan,
  type SpreadPoint,
} from './scene.js';

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { globalAndLocalAlgorithm, type GlobalAndLocalData } from './algorithm.js';
import { globalAndLocalIRs } from './irs.js';
import { globalAndLocalFacet } from './facet.js';
import { globalAndLocalStageView } from './global-and-local-stage.js';
import { globalAndLocalScene } from './scene.js';

export function registerGlobalAndLocal(): void {
  registerAlgorithm<GlobalAndLocalData>('globalAndLocal', globalAndLocalAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('globalAndLocalScene', globalAndLocalScene);
  for (const ir of globalAndLocalIRs) registerIR(ir.id, ir);
  registerView('global-and-local-stage', globalAndLocalStageView);
  registerFacets([globalAndLocalFacet]);
}

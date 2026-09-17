/**
 * @ffacet/algorithm-growth-outpaces — 조각(piece) 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다. 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export {
  growthOutpaces,
  computeRung,
  ladderOf,
  type GrowthOutpacesData,
  type GrowthCoeffs,
  type GrowthRung,
} from './algorithm.js';
export {
  growthOutpacesScene,
  type GrowthOutpacesScene,
  type GrowthRungKind,
  type GrowthStep,
  type GrowthCaption,
} from './scene.js';
export { growthOutpacesIRs } from './irs.js';
export { growthOutpacesStageView } from './growth-outpaces-stage.js';
export { growthOutpacesFacet } from './facet.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerView,
  registerFacets,
} from '@ffacet/core/runtime';
import { growthOutpaces, type GrowthOutpacesData } from './algorithm.js';
import { growthOutpacesScene } from './scene.js';
import { growthOutpacesIRs } from './irs.js';
import { growthOutpacesStageView } from './growth-outpaces-stage.js';
import { growthOutpacesFacet } from './facet.js';

export function registerGrowthOutpaces(): void {
  // 조각은 컨트롤바 없이 스스로 시작하고 걸음 간격도 스스로 정한다 — 둘 다
  // reactive 만 준다 (S-piece).
  registerAlgorithm<GrowthOutpacesData>('growthOutpaces', growthOutpaces, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('growthOutpacesScene', growthOutpacesScene);
  for (const ir of growthOutpacesIRs) registerIR(ir.id, ir);
  registerView('growth-outpaces-stage', growthOutpacesStageView);
  registerFacets([growthOutpacesFacet]);
}

/**
 * indexAddressCalc 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { indexAddressCalc, type IndexAddressCalcData } from './algorithm.js';
import { indexAddressCalcScene } from './scene.js';
import { indexAddressCalcIRs } from './irs.js';
import { addressCalcStageView } from './address-calc-stage.js';
import { indexAddressCalcFacet } from './facet.js';

export { indexAddressCalc, indexAddressCalcScene, indexAddressCalcIRs };
export type { IndexAddressCalcScene } from './scene.js';
export { addressCalcStageView, indexAddressCalcFacet };
export type { IndexAddressCalcData };

export function registerIndexAddressCalc(): void {
  registerAlgorithm<IndexAddressCalcData>('indexAddressCalc', indexAddressCalc, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('indexAddressCalcScene', indexAddressCalcScene);
  for (const ir of indexAddressCalcIRs) registerIR(ir.id, ir);
  registerView('address-calc-stage', addressCalcStageView);
  registerFacets([indexAddressCalcFacet]);
}

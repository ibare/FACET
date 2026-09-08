/**
 * indexAddressCalc 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { indexAddressCalc, type IndexAddressCalcData } from './algorithm.js';
import { indexAddressCalcProjector } from './projector.js';
import { indexAddressCalcIRs } from './irs.js';
import { addressCalcStageView } from './address-calc-stage.js';
import { indexAddressCalcFacet } from './facet.js';
import { indexAddressCalcDescription } from './description.js';

export { indexAddressCalc, indexAddressCalcProjector, indexAddressCalcIRs };
export { addressCalcStageView, indexAddressCalcFacet, indexAddressCalcDescription };
export type { IndexAddressCalcData };

export function registerIndexAddressCalc(): void {
  registerAlgorithm<IndexAddressCalcData>('indexAddressCalc', indexAddressCalc, {
    mechanismKind: 'reactive',
  });
  registerProjector('indexAddressCalcProjector', indexAddressCalcProjector);
  for (const ir of indexAddressCalcIRs) registerIR(ir.id, ir);
  registerView('address-calc-stage', addressCalcStageView);
  registerFacets([indexAddressCalcFacet]);
  registerDescription(indexAddressCalcFacet.id, indexAddressCalcDescription);
}

/**
 * 곱 양자화 facet 등록 진입점.
 *
 * `mechanismKind: 'reactive'` 를 여기서 선언한다 — 손잡이(segmented-slider)가
 * 붙은 완제품은 coroutine 으로 돌 수 없다. `CoroutineMechanism.supportedControls`
 * 에 facet 고유 어휘가 없어 러너가 마운트 시점에 던지고, 설령 통과해도
 * `dispatch` 가 no-op 이라 손잡이가 알고리즘에 닿지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core';

import { productQuantizationAlgorithm, type ProductQuantizationData } from './algorithm.js';
import { productQuantizationProjector } from './projector.js';
import { productQuantizationIRs } from './irs.js';
import { productQuantizationStageView } from './product-quantization-stage.js';
import { productQuantizationFacet } from './facet.js';
import { productQuantizationDescription } from './description.js';

export {
  productQuantizationAlgorithm,
  productQuantizationProjector,
  productQuantizationIRs,
  productQuantizationStageView,
  productQuantizationFacet,
  productQuantizationDescription,
};
export {
  computeProductQuantizationRound,
  normalizeParts,
  type ProductQuantizationData,
  type ProductQuantizationRound,
} from './algorithm.js';

export function registerProductQuantization(): void {
  registerAlgorithm<ProductQuantizationData>('productQuantization', productQuantizationAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('productQuantizationProjector', productQuantizationProjector);
  for (const ir of productQuantizationIRs) registerIR(ir.id, ir);
  registerView('product-quantization-stage', productQuantizationStageView);
  registerFacets([productQuantizationFacet]);
  registerDescription(productQuantizationFacet.id, productQuantizationDescription);
}

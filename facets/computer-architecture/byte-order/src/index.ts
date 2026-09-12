/**
 * byteOrder 조각의 등록 진입점.
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

import { byteOrderAlgorithm, splitBytes, type ByteOrderData } from './algorithm.js';
import { byteOrderStageView } from './byte-order-stage.js';
import { byteOrderDescription } from './description.js';
import { byteOrderFacet } from './facet.js';
import { byteOrderIRs } from './irs.js';
import { byteOrderProjector } from './projector.js';

export function registerByteOrder(): void {
  registerAlgorithm('byteOrder', byteOrderAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('byteOrderProjector', byteOrderProjector);
  for (const ir of byteOrderIRs) registerIR(ir.id, ir);
  registerView('byte-order-stage', byteOrderStageView);
  registerFacets([byteOrderFacet]);
  registerDescription(byteOrderFacet.id, byteOrderDescription);
}

export {
  byteOrderAlgorithm,
  byteOrderDescription,
  byteOrderFacet,
  byteOrderIRs,
  byteOrderProjector,
  byteOrderStageView,
  splitBytes,
};
export type { ByteOrderData };

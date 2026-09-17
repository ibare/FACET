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
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { byteOrderAlgorithm, splitBytes, type ByteOrderData } from './algorithm.js';
import { byteOrderStageView } from './byte-order-stage.js';
import { byteOrderDescription } from './description.js';
import { byteOrderFacet } from './facet.js';
import { byteOrderIRs } from './irs.js';
import { byteOrderScene } from './scene.js';

export function registerByteOrder(): void {
  registerAlgorithm('byteOrder', byteOrderAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('byteOrderScene', byteOrderScene);
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
  byteOrderScene,
  byteOrderStageView,
  splitBytes,
};
export type { ByteOrderData };
// 장면이 내주는 셈. 화면에 뜨는 세 수와 훑는 차례가 전부 여기서 나온다.
export {
  bigRow,
  littleRow,
  msbAddrOf,
  originAt,
  readOrderOf,
  rowOf,
  valueOf,
  type ByteOrderReading,
  type ByteOrderScene,
  type ByteOrderSceneCaption,
  type ByteOrderSceneStep,
} from './scene.js';

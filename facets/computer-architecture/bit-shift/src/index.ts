/**
 * 자리 옮기기 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 부르는 것은 호스트의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { bitShiftAlgorithm, type BitShiftData } from './algorithm.js';
import { bitShiftScene } from './scene.js';
import { bitShiftStageView } from './bit-shift-stage.js';
import { bitShiftFacet } from './facet.js';
import { bitShiftDescription } from './description.js';
import { bitShiftIRs } from './irs.js';

export function registerBitShift(): void {
  registerAlgorithm<BitShiftData>('bitShift', bitShiftAlgorithm, {
    // 조각은 mount 시 스스로 시작하고 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerScenePlan('bitShiftScene', bitShiftScene);
  for (const ir of bitShiftIRs) registerIR(ir.id, ir);
  registerView('bit-shift-stage', bitShiftStageView);
  registerFacets([bitShiftFacet]);
  registerDescription(bitShiftFacet.id, bitShiftDescription);
}

export {
  bitShiftAlgorithm,
  bitShiftScene,
  bitShiftStageView,
  bitShiftFacet,
  bitShiftDescription,
  bitShiftIRs,
};
export type { BitShiftData };
export type { BitShiftCaption, BitShiftDir, BitShiftScene, BitShiftStep } from './scene.js';

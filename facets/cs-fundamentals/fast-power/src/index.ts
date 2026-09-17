/**
 * @ffacet/algorithm-fast-power — 등록 진입점.
 *
 * 등록 책임은 호스트 앱에 있다. 이 파일은 사이드 이펙트로 스스로를 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { fastPowerAlgorithm, type FastPowerData } from './algorithm.js';
import { fastPowerProjector } from './projector.js';
import { fastPowerIRs, fastPowerImperativeIR } from './irs.js';
import { fastPowerStageView } from './fast-power-stage.js';
import { fastPowerFacet } from './facet.js';

export {
  fastPowerAlgorithm,
  fastPowerProjector,
  fastPowerIRs,
  fastPowerImperativeIR,
  fastPowerStageView,
  fastPowerFacet,
};
export type { FastPowerData };

export function registerFastPower(): void {
  registerAlgorithm<FastPowerData>('fastPower', fastPowerAlgorithm, {
    // 손잡이가 있는 완제품은 reactive 다 — 조작이 곧 다음 판의 시작이다.
    mechanismKind: 'reactive',
  });
  registerProjector('fastPowerProjector', fastPowerProjector);
  for (const ir of fastPowerIRs) registerIR(ir.id, ir);
  registerView('fast-power-stage', fastPowerStageView);
  registerFacets([fastPowerFacet]);
}

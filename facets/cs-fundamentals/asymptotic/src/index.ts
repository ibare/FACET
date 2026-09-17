/**
 * @ffacet/algorithm-asymptotic — 등록 진입점.
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

import { asymptoticAlgorithm, type AsymptoticData } from './algorithm.js';
import { asymptoticProjector } from './projector.js';
import { asymptoticIRs } from './irs.js';
import { asymptoticStageView } from './asymptotic-stage.js';
import { asymptoticFacet } from './facet.js';

export {
  asymptoticAlgorithm,
  computeAsymptoticRows,
  costOf,
  logFactor,
  type AsymptoticData,
  type AsymptoticRow,
  type GrowthShape,
} from './algorithm.js';
export { asymptoticProjector } from './projector.js';
export { asymptoticIRs, asymptoticImperativeIR } from './irs.js';
export {
  asymptoticStageView,
  tilePitch,
  RECORD_CAPACITY,
  TILE_CAPACITY,
  type AsymptoticStageInstance,
  type AsymptoticTiling,
} from './asymptotic-stage.js';
export { asymptoticFacet } from './facet.js';

export function registerAsymptotic(): void {
  registerAlgorithm<AsymptoticData>('asymptotic', asymptoticAlgorithm, {
    // 손잡이가 있는 완제품은 reactive 다 — 조작이 곧 다음 판의 시작이다.
    mechanismKind: 'reactive',
  });
  registerProjector('asymptoticProjector', asymptoticProjector);
  for (const ir of asymptoticIRs) registerIR(ir.id, ir);
  registerView('asymptotic-stage', asymptoticStageView);
  registerFacets([asymptoticFacet]);
}

/**
 * 완전 탐색 facet 의 등록 진입점.
 *
 * 호출 책임은 호스트 앱에 있다 — 이 파일은 사이드 이펙트로 스스로를 등록하지
 * 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { exhaustiveSearchAlgorithm } from './algorithm.js';
import { exhaustiveSearchProjector } from './projector.js';
import { exhaustiveSearchIRs } from './irs.js';
import { exhaustiveSearchStageView } from './exhaustive-search-stage.js';
import { exhaustiveSearchFacet } from './facet.js';

export function registerExhaustiveSearch(): void {
  // 손잡이를 받으려면 reactive 여야 한다 — 차원을 고른 뒤 다시 도는 것이
  // 이 화면의 진행 동력이고, 그 대기는 `ctx.waitForInput` 이 진다.
  registerAlgorithm('exhaustiveSearch', exhaustiveSearchAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('exhaustiveSearchProjector', exhaustiveSearchProjector);
  for (const ir of exhaustiveSearchIRs) registerIR(ir.id, ir);
  registerView('exhaustive-search-stage', exhaustiveSearchStageView);
  registerFacets([exhaustiveSearchFacet]);
}

export {
  exhaustiveSearchAlgorithm,
  exhaustiveSearchCost,
  exhaustiveSearchTilesMax,
  exhaustiveSearchUnit,
} from './algorithm.js';
export type { ExhaustiveSearchCost, ExhaustiveSearchData } from './algorithm.js';
export { exhaustiveSearchProjector } from './projector.js';
export { exhaustiveSearchIRs } from './irs.js';
export {
  exhaustiveSearchPlateGrid,
  exhaustiveSearchStageView,
  formatAmount,
} from './exhaustive-search-stage.js';
export type { ExhaustiveScene, ExhaustiveStep } from './exhaustive-search-stage.js';
export { exhaustiveSearchFacet } from './facet.js';

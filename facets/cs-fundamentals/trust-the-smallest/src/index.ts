/**
 * trust-the-smallest 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 등록 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { trustTheSmallestAlgorithm, type TrustTheSmallestData } from './algorithm.js';
import { trustTheSmallestDescription } from './description.js';
import { trustTheSmallestFacet } from './facet.js';
import { trustTheSmallestIRs } from './irs.js';
import { trustTheSmallestProjector } from './projector.js';
import { trustTheSmallestStageView } from './trust-the-smallest-stage.js';

export function registerTrustTheSmallest(): void {
  registerAlgorithm<TrustTheSmallestData>('trustTheSmallest', trustTheSmallestAlgorithm, {
    // 조각은 마운트하면 스스로 시작하고 걸음 간격도 스스로 정한다 — 둘 다
    // reactive 만 준다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerProjector('trustTheSmallestProjector', trustTheSmallestProjector);
  for (const ir of trustTheSmallestIRs) registerIR(ir.id, ir);
  registerView('trust-the-smallest-stage', trustTheSmallestStageView);
  registerFacets([trustTheSmallestFacet]);
  registerDescription(trustTheSmallestFacet.id, trustTheSmallestDescription);
}

export { trustTheSmallestAlgorithm, trustTheSmallestCellsOf } from './algorithm.js';
export type {
  TrustTheSmallestCell,
  TrustTheSmallestData,
  TrustTheSmallestStreamItem,
} from './algorithm.js';
export { trustTheSmallestProjector } from './projector.js';
export { trustTheSmallestIRs } from './irs.js';
export { trustTheSmallestFacet } from './facet.js';
export { trustTheSmallestDescription } from './description.js';
export { readTrustScene, trustTheSmallestStageView } from './trust-the-smallest-stage.js';
export type { TrustTheSmallestScene } from './trust-the-smallest-stage.js';

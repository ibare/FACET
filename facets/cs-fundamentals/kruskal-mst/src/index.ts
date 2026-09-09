/**
 * 크루스칼 최소 신장 트리 facet 의 등록 진입점.
 *
 * 호출 책임은 호스트 앱에 있다 — 이 모듈은 부작용으로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { kruskalMstAlgorithm, type KruskalEdge, type KruskalMstData } from './algorithm.js';
import { kruskalMstProjector } from './projector.js';
import { kruskalMstIRs, kruskalUnionIR } from './irs.js';
import { kruskalMstStageView } from './kruskal-mst-stage.js';
import { kruskalMstFacet } from './facet.js';
import { kruskalMstDescription } from './description.js';

export {
  kruskalMstAlgorithm,
  kruskalMstProjector,
  kruskalMstIRs,
  kruskalUnionIR,
  kruskalMstStageView,
  kruskalMstFacet,
  kruskalMstDescription,
};
export type { KruskalEdge, KruskalMstData };

export function registerKruskalMst(): void {
  registerAlgorithm<KruskalMstData>('kruskalMst', kruskalMstAlgorithm);
  registerProjector('kruskalMstProjector', kruskalMstProjector);
  for (const ir of kruskalMstIRs) registerIR(ir.id, ir);
  registerView('kruskal-mst-stage', kruskalMstStageView);
  registerFacets([kruskalMstFacet]);
  registerDescription(kruskalMstFacet.id, kruskalMstDescription);
}

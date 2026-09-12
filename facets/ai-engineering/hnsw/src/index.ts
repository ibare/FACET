/**
 * HNSW facet 등록 진입점.
 *
 * `mechanismKind: 'reactive'` 를 여기서 선언한다 — 선언 자리는 `facet.ts` 가
 * 아니라 등록 옵션이다. 손잡이(구간 슬라이더)가 붙은 완제품은 reactive 여야
 * 한다: `CoroutineMechanism.supportedControls` 에 `'*'` 가 없어 러너의
 * `assertControlsSupported` 가 마운트 시점에 던지고, 통과하더라도 그쪽
 * `dispatch` 는 no-op 이라 손잡이가 알고리즘에 닿지 않는다.
 */

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';

import { hnswAlgorithm, computeHnswRound, type HnswData } from './algorithm.js';
import { hnswProjector } from './projector.js';
import { hnswStageView } from './hnsw-stage.js';
import { hnswIRs } from './irs.js';
import { hnswFacet } from './facet.js';
import { hnswDescription } from './description.js';

export function registerHnsw(): void {
  registerAlgorithm<HnswData>('hnsw', hnswAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('hnswProjector', hnswProjector);
  for (const ir of hnswIRs) registerIR(ir.id, ir);
  registerView('hnsw-stage', hnswStageView);
  registerFacets([hnswFacet]);
  registerDescription(hnswFacet.id, hnswDescription);
}

export {
  hnswAlgorithm,
  computeHnswRound,
  hnswProjector,
  hnswStageView,
  hnswIRs,
  hnswFacet,
  hnswDescription,
};
export type { HnswData } from './algorithm.js';
export type { HnswPoint, HnswRound, HnswStep, HnswWalk, HnswWalkerFrame } from './algorithm.js';
export type { HnswStageFrame, HnswStageScene, HnswStageWalker } from './hnsw-stage.js';

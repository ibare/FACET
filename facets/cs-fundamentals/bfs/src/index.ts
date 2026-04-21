/**
 * @facet/algorithm-bfs — 4-layer 알고리즘 모듈.
 *
 * 동심 파면 + FIFO 큐 + 거리 라벨 + 레이어 섬광의 5가지 시각적 정체성을
 * 조율하는 projector 와 함께 동작. 본 모듈은 algorithm / projector / IR /
 * facet JSON / description 을 한 번에 번들해 export + 등록 헬퍼를 제공한다.
 */

export { bfs, computeBfsResult, type BfsGraphData } from './algorithm.js';
export { bfsProjector, BFS_CANVAS } from './projector.js';
export { bfsIterativeIR, bfsIRs } from './irs.js';
export { bfsFacet } from './facet.js';
export { bfsDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { bfs, type BfsGraphData } from './algorithm.js';
import { bfsProjector } from './projector.js';
import { bfsIRs } from './irs.js';
import { bfsFacet } from './facet.js';
import { bfsDescription } from './description.js';

/** algorithm/projector/IR/facet/description 등록 헬퍼 (transpiler 는 호스트가 별도 등록). */
export function registerBfs(): void {
  registerAlgorithm<BfsGraphData>('bfs', bfs);
  registerProjector('bfsProjector', bfsProjector);
  for (const ir of bfsIRs) registerIR(ir.id, ir);
  registerFacets([bfsFacet]);
  registerDescription(bfsFacet.id, bfsDescription);
}

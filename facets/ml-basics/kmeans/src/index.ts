/**
 * @ffacet/algorithm-kmeans — k-평균 완제품 번들.
 *
 * reactive 진행. mount 직후 한 판을 자동으로 굴려 멎는 자리까지 보이고, 그 뒤
 * k 슬라이더와 "시작 다시 뽑기" 를 기다린다. 코드 패널은 `ir:kmeans` — 한 걸음
 * (할당 한 번 + 갱신 한 번) 이 여섯 언어로 갈린다.
 */

export { kmeans, type KmeansData, type KmeansReaderAnswer } from './algorithm.js';
export { kmeansProjector } from './projector.js';
export { kmeansStepIR, kmeansIRs } from './irs.js';
export { kmeansFacet } from './facet.js';
export { kmeansDescription } from './description.js';
export { kmeansStageView } from './kmeans-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { kmeans, type KmeansData } from './algorithm.js';
import { kmeansProjector } from './projector.js';
import { kmeansIRs } from './irs.js';
import { kmeansFacet } from './facet.js';
import { kmeansDescription } from './description.js';
import { kmeansStageView } from './kmeans-stage.js';

export function registerKmeans(): void {
  registerAlgorithm<KmeansData>('kmeans', kmeans, { mechanismKind: 'reactive' });
  registerProjector('kmeansProjector', kmeansProjector);
  for (const ir of kmeansIRs) registerIR(ir.id, ir);
  registerView('kmeans-stage', kmeansStageView);
  registerFacets([kmeansFacet]);
  registerDescription(kmeansFacet.id, kmeansDescription);
}

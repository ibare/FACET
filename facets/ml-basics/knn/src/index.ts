/**
 * @ffacet/algorithm-knn — k-최근접 이웃 (k-nearest neighbours) facet 번들.
 *
 * 입력 반응형 (`ReactiveMechanism`). mount 직후 평면 전체의 판정을 한 번 셈해
 * 경계를 그려 두고 멈춘다. 컨트롤바는 재생 · 한 걸음 · 멈춤 · 되감기 · 속도에
 * **k 슬라이더 (1 / 3 / 7 / 15)** 를 얹은 것이며, 그 슬라이더가 이 완제품의
 * 논증을 진다. 재생 · 멈춤 · 한 걸음은 메커니즘이 `ctx.sleep` 의 걸음 경계에서
 * 지므로 algorithm 은 위젯 입력만 본다.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 view (knn-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다.
 */

export { knn, LABEL_A, LABEL_B, type KnnData, type KnnPoint } from './algorithm.js';
export { knnProjector } from './projector.js';
export { knnClassifyIR, knnIRs } from './irs.js';
export { knnFacet } from './facet.js';
export { knnDescription } from './description.js';
export { knnStageView } from './knn-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { knn, type KnnData } from './algorithm.js';
import { knnProjector } from './projector.js';
import { knnIRs } from './irs.js';
import { knnFacet } from './facet.js';
import { knnDescription } from './description.js';
import { knnStageView } from './knn-stage.js';

export function registerKnn(): void {
  registerAlgorithm<KnnData>('knn', knn, { mechanismKind: 'reactive' });
  registerProjector('knnProjector', knnProjector);
  for (const ir of knnIRs) registerIR(ir.id, ir);
  registerView('knn-stage', knnStageView);
  registerFacets([knnFacet]);
  registerDescription(knnFacet.id, knnDescription);
}

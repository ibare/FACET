/**
 * dense-neighborhood 등록 진입점.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). `registerDenseNeighborhood()` 를 여기서 부르지 않는다 — 호출 책임은
 * 호스트에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { denseNeighborhoodAlgorithm } from './algorithm.js';
import { denseNeighborhoodStageView } from './dense-neighborhood-stage.js';
import { denseNeighborhoodFacet } from './facet.js';
import { denseNeighborhoodIRs } from './irs.js';
import { denseNeighborhoodScene } from './scene.js';

export { denseNeighborhoodAlgorithm } from './algorithm.js';
export type { DenseNeighborhoodData, DenseNeighborhoodPoint } from './algorithm.js';
export { denseNeighborhoodStageView } from './dense-neighborhood-stage.js';
export { denseNeighborhoodFacet } from './facet.js';
export { denseNeighborhoodIRs } from './irs.js';
export {
  denseNeighborhoodScene,
  type DenseNeighborhoodScene,
  type DenseCluster,
  type DenseMark,
  type DensePair,
  type DensePoint,
  type DenseStep,
  type DenseWave,
} from './scene.js';

export function registerDenseNeighborhood(): void {
  registerAlgorithm('denseNeighborhood', denseNeighborhoodAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('denseNeighborhoodScene', denseNeighborhoodScene);
  for (const ir of denseNeighborhoodIRs) registerIR(ir.id, ir);
  registerView('dense-neighborhood-stage', denseNeighborhoodStageView);
  registerFacets([denseNeighborhoodFacet]);
}

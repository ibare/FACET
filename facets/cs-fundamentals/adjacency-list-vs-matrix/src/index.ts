/**
 * @ffacet/algorithm-adjacency-list-vs-matrix — 인접 리스트 vs 인접 행렬
 * 조각(piece) facet 번들.
 *
 * 다섯 간선을 자동 재생한 뒤 두 물음을 이어 재생하고 멈춘다. 다시 보기와
 * 띠(스크럽) 외에는 조작을 받지 않으며, 아무것도 누르지 않아도 화면은 할 말을
 * 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { adjacencyListVsMatrixAlgorithm, type AdjacencyListVsMatrixData } from './algorithm.js';
import { adjacencyListVsMatrixScene } from './scene.js';
import { adjacencyListVsMatrixIRs } from './irs.js';
import { adjacencyListVsMatrixFacet } from './facet.js';
import { adjacencyListVsMatrixDescription } from './description.js';
import { adjacencyListVsMatrixStageView } from './adjacency-list-vs-matrix-stage.js';

export function registerAdjacencyListVsMatrix(): void {
  registerAlgorithm<AdjacencyListVsMatrixData>('adjacencyListVsMatrix', adjacencyListVsMatrixAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('adjacencyListVsMatrixScene', adjacencyListVsMatrixScene);
  for (const ir of adjacencyListVsMatrixIRs) registerIR(ir.id, ir);
  registerView('adjacency-list-vs-matrix-stage', adjacencyListVsMatrixStageView);
  registerFacets([adjacencyListVsMatrixFacet]);
  registerDescription(adjacencyListVsMatrixFacet.id, adjacencyListVsMatrixDescription);
}

export {
  adjacencyListVsMatrixAlgorithm,
  adjacencyOf,
  queryVertexOf,
  targetVertexOf,
  type AdjacencyListVsMatrixData,
} from './algorithm.js';
export {
  adjacencyListVsMatrixScene,
  costOf,
  listsOf,
  reservedCells,
  type AdjacencyListVsMatrixScene,
  type AdjacencyProbe,
  type AdjacencyRun,
  type AdjacencySceneCaption,
  type AdjacencySceneStep,
  type AdjacencySide,
} from './scene.js';
export { adjacencyListVsMatrixIRs } from './irs.js';
export { adjacencyListVsMatrixFacet } from './facet.js';
export { adjacencyListVsMatrixDescription } from './description.js';
export { adjacencyListVsMatrixStageView } from './adjacency-list-vs-matrix-stage.js';

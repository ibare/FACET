/**
 * 등록 진입점. 호스트가 부른다 — 이 파일이 스스로 부르지 않는다 (S-facet).
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { neighborsLinkedAheadAlgorithm } from './algorithm.js';
import type { NeighborsLinkedAheadData } from './algorithm.js';
import { neighborsLinkedAheadIRs } from './irs.js';
import { neighborsLinkedAheadScene } from './scene.js';
import { neighborsLinkedAheadStageView } from './neighbors-linked-ahead-stage.js';
import { neighborsLinkedAheadFacet } from './facet.js';
import { neighborsLinkedAheadDescription } from './description.js';

export { neighborsLinkedAheadAlgorithm, nearestNeighbors, undirectedLinks } from './algorithm.js';
export type { NeighborsLinkedAheadData, NeighborsPoint } from './algorithm.js';
export { neighborsLinkedAheadIRs } from './irs.js';
export { neighborsLinkedAheadStageView } from './neighbors-linked-ahead-stage.js';
export { neighborsLinkedAheadFacet } from './facet.js';
export { neighborsLinkedAheadDescription } from './description.js';
export { graphOf, neighborsLinkedAheadScene, phaseOf, probeNow, standing, strayMarks } from './scene.js';
export type {
  NeighborsGraph,
  NeighborsLinkedAheadScene,
  NeighborsPhase,
  NeighborsStep,
  ScenePt,
} from './scene.js';

export function registerNeighborsLinkedAhead(): void {
  // 조각은 스스로 시작하고 걸음 간격도 스스로 정해야 하므로 reactive 다 (S-piece).
  registerAlgorithm<NeighborsLinkedAheadData>('neighborsLinkedAhead', neighborsLinkedAheadAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('neighborsLinkedAheadScene', neighborsLinkedAheadScene);
  for (const ir of neighborsLinkedAheadIRs) registerIR(ir.id, ir);
  registerView('neighbors-linked-ahead-stage', neighborsLinkedAheadStageView);
  registerFacets([neighborsLinkedAheadFacet]);
  registerDescription(neighborsLinkedAheadFacet.id, neighborsLinkedAheadDescription);
}

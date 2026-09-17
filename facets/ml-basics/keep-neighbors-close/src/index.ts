/**
 * keepNeighborsClose 등록 진입점.
 *
 * 반응형(ReactiveMechanism). mount 하면 스스로 한 바퀴 돌고, 그 뒤로는 다시 보기와
 * 띠로 곱씹을 수 있다. 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든
 * 곧장 갈 수 있다 (S-scene).
 *
 * 부르는 것은 호스트의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { keepNeighborsCloseAlgorithm } from './algorithm.js';
import type { KeepNeighborsCloseData } from './algorithm.js';
import { keepNeighborsCloseFacet } from './facet.js';
import { keepNeighborsCloseIRs } from './irs.js';
import { keepNeighborsCloseStageView } from './keep-neighbors-close-stage.js';
import { keepNeighborsCloseScene } from './scene.js';

export { keepNeighborsCloseAlgorithm, keepNeighborsCloseGaps } from './algorithm.js';
export type { KeepNeighborsCloseData, KeepNeighborsClosePoint } from './algorithm.js';
export { keepNeighborsCloseFacet } from './facet.js';
export { keepNeighborsCloseIRs } from './irs.js';
export { keepNeighborsCloseStageView } from './keep-neighbors-close-stage.js';
export { keepNeighborsCloseScene } from './scene.js';
export type {
  KeepNeighborsClosePhase,
  KeepNeighborsCloseScene,
  KeepNeighborsCloseStep,
  ScenePt,
} from './scene.js';

export function registerKeepNeighborsClose(): void {
  registerAlgorithm<KeepNeighborsCloseData>('keepNeighborsClose', keepNeighborsCloseAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('keepNeighborsCloseScene', keepNeighborsCloseScene);
  for (const ir of keepNeighborsCloseIRs) registerIR(ir.id, ir);
  registerView('keep-neighbors-close-stage', keepNeighborsCloseStageView);
  registerFacets([keepNeighborsCloseFacet]);
}

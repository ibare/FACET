/**
 * heuristic-guides — 등록 진입점.
 *
 * 사이드 이펙트로 스스로를 등록하지 않는다. 부르는 것은 호스트의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import type { FacetContext } from '@ffacet/core/runtime';

import { heuristicGuidesAlgorithm, type HeuristicGuidesData } from './algorithm.js';
import { heuristicGuidesScene } from './scene.js';
import { heuristicGuidesIRs } from './irs.js';
import { heuristicGuidesStageView } from './heuristic-guides-stage.js';
import { heuristicGuidesFacet } from './facet.js';

export {
  heuristicGuidesAlgorithm,
  computeHeuristicGuidesResult,
  type HeuristicGuidesData,
  type Cell,
  type Move,
  remainingGuess,
} from './algorithm.js';
export {
  heuristicGuidesScene,
  type HeuristicGuidesScene,
  type HeuristicGuidesSceneBoard,
} from './scene.js';
export { heuristicGuidesIRs } from './irs.js';
export { heuristicGuidesStageView } from './heuristic-guides-stage.js';
export { heuristicGuidesFacet } from './facet.js';

export function registerHeuristicGuides(): void {
  registerAlgorithm<HeuristicGuidesData>(
    'heuristicGuides',
    heuristicGuidesAlgorithm as unknown as (ctx: FacetContext<HeuristicGuidesData>) => Promise<void>,
    { mechanismKind: 'reactive' },
  );
  registerScenePlan('heuristicGuidesScene', heuristicGuidesScene);
  for (const ir of heuristicGuidesIRs) registerIR(ir.id, ir);
  registerView('heuristic-guides-stage', heuristicGuidesStageView);
  registerFacets([heuristicGuidesFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { whoGoesFirst, type WhoGoesFirstFacetData } from './algorithm.js';
import { whoGoesFirstScene } from './scene.js';
import { whoGoesFirstIRs } from './irs.js';
import { whoGoesFirstStageView } from './who-goes-first-stage.js';
import { whoGoesFirstFacet } from './facet.js';

export { whoGoesFirst, graphLayers, ruleMap } from './algorithm.js';
export type { WhoGoesFirstFacetData, WhoGoesFirstRule } from './algorithm.js';
export { whoGoesFirstScene } from './scene.js';
export type { WhoGoesFirstSceneState, WhoGoesFirstStep } from './scene.js';
export { whoGoesFirstIRs } from './irs.js';
export { whoGoesFirstStageView } from './who-goes-first-stage.js';
export { whoGoesFirstFacet } from './facet.js';

export function registerWhoGoesFirst(): void {
  registerAlgorithm<WhoGoesFirstFacetData>('whoGoesFirst', whoGoesFirst, { mechanismKind: 'reactive' });
  registerScenePlan('whoGoesFirstScene', whoGoesFirstScene);
  for (const ir of whoGoesFirstIRs) registerIR(ir.id, ir);
  registerView('who-goes-first-stage', whoGoesFirstStageView);
  registerFacets([whoGoesFirstFacet]);
}

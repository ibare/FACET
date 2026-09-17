/**
 * grow-one-tree — 등록 진입점. 호출은 호스트가 한다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { growOneTreeAlgorithm } from './algorithm.js';
import type { GrowOneTreeData, GrowOneTreeEdge } from './algorithm.js';
import { growOneTreeScene } from './scene.js';
import type { GrowOneTreeScene } from './scene.js';
import { growOneTreeIRs } from './irs.js';
import { growOneTreeStageView } from './grow-one-tree-stage.js';
import { growOneTreeFacet } from './facet.js';

export {
  growOneTreeAlgorithm,
  growOneTreeScene,
  growOneTreeIRs,
  growOneTreeStageView,
  growOneTreeFacet,
};
export type { GrowOneTreeData, GrowOneTreeEdge, GrowOneTreeScene };

export function registerGrowOneTree(): void {
  registerAlgorithm<GrowOneTreeData>('growOneTree', growOneTreeAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('growOneTreeScene', growOneTreeScene);
  for (const ir of growOneTreeIRs) registerIR(ir.id, ir);
  registerView('grow-one-tree-stage', growOneTreeStageView);
  registerFacets([growOneTreeFacet]);
}

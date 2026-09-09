/**
 * grow-one-tree — 등록 진입점. 호출은 호스트가 한다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { growOneTreeAlgorithm } from './algorithm.js';
import type { GrowOneTreeData, GrowOneTreeEdge } from './algorithm.js';
import { growOneTreeProjector } from './projector.js';
import { growOneTreeIRs } from './irs.js';
import { growOneTreeStageView } from './grow-one-tree-stage.js';
import { growOneTreeFacet } from './facet.js';
import { growOneTreeDescription } from './description.js';

export {
  growOneTreeAlgorithm,
  growOneTreeProjector,
  growOneTreeIRs,
  growOneTreeStageView,
  growOneTreeFacet,
  growOneTreeDescription,
};
export type { GrowOneTreeData, GrowOneTreeEdge };

export function registerGrowOneTree(): void {
  registerAlgorithm<GrowOneTreeData>('growOneTree', growOneTreeAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('growOneTreeProjector', growOneTreeProjector);
  for (const ir of growOneTreeIRs) registerIR(ir.id, ir);
  registerView('grow-one-tree-stage', growOneTreeStageView);
  registerFacets([growOneTreeFacet]);
  registerDescription(growOneTreeFacet.id, growOneTreeDescription);
}

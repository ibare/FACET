import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { cascadeConflict, type CascadeConflictFacetData } from './algorithm.js';
import { cascadeConflictScene } from './scene.js';
import { cascadeConflictStageView } from './cascade-conflict-stage.js';
import { cascadeConflictIRs } from './irs.js';
import { cascadeConflictFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './cascade-conflict-stage.js';
export * from './irs.js';
export * from './facet.js';

/** 이 조각을 러너에 등록한다. 부르는 것은 호스트 몫이다. */
export function registerCascadeConflict(): void {
  registerAlgorithm<CascadeConflictFacetData>('cascadeConflict', cascadeConflict, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('cascadeConflictScene', cascadeConflictScene);
  for (const ir of cascadeConflictIRs) registerIR(ir.id, ir);
  registerView('cascade-conflict-stage', cascadeConflictStageView);
  registerFacets([cascadeConflictFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { nonRepeatableRead, type NonRepeatableReadFacetData } from './algorithm.js';
import { nonRepeatableReadScene } from './scene.js';
import { nonRepeatableReadIRs } from './irs.js';
import { nonRepeatableReadStageView } from './non-repeatable-read-stage.js';
import { nonRepeatableReadFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './non-repeatable-read-stage.js';
export * from './facet.js';

export function registerNonRepeatableRead(): void {
  registerAlgorithm<NonRepeatableReadFacetData>('nonRepeatableRead', nonRepeatableRead, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('nonRepeatableReadScene', nonRepeatableReadScene);
  for (const ir of nonRepeatableReadIRs) registerIR(ir.id, ir);
  registerView('non-repeatable-read-stage', nonRepeatableReadStageView);
  registerFacets([nonRepeatableReadFacet]);
}

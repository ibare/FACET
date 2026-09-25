import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { curryingPartial, type CurryingPartialFacetData } from './algorithm.js';
import { curryingPartialScene } from './scene.js';
import { curryingPartialStageView } from './currying-partial-stage.js';
import { curryingPartialIRs } from './irs.js';
import { curryingPartialFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './currying-partial-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerCurryingPartial(): void {
  registerAlgorithm<CurryingPartialFacetData>('curryingPartial', curryingPartial, { mechanismKind: 'reactive' });
  registerScenePlan('curryingPartialScene', curryingPartialScene);
  for (const ir of curryingPartialIRs) registerIR(ir.id, ir);
  registerView('currying-partial-stage', curryingPartialStageView);
  registerFacets([curryingPartialFacet]);
}

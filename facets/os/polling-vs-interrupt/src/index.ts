import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pollingVsInterrupt, type PollingVsInterruptFacetData } from './algorithm.js';
import { pollingVsInterruptScene } from './scene.js';
import { pollingVsInterruptStageView } from './polling-vs-interrupt-stage.js';
import { pollingVsInterruptIRs } from './irs.js';
import { pollingVsInterruptFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './polling-vs-interrupt-stage.js';
export * from './irs.js';
export * from './facet.js';

/** 이 조각을 레지스트리에 올린다. 호출은 호스트 몫이다. */
export function registerPollingVsInterrupt(): void {
  registerAlgorithm<PollingVsInterruptFacetData>('pollingVsInterrupt', pollingVsInterrupt, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('pollingVsInterruptScene', pollingVsInterruptScene);
  for (const ir of pollingVsInterruptIRs) registerIR(ir.id, ir);
  registerView('polling-vs-interrupt-stage', pollingVsInterruptStageView);
  registerFacets([pollingVsInterruptFacet]);
}

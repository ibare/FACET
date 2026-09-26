import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sixteenMilliseconds, type SixteenMillisecondsFacetData } from './algorithm.js';
import { sixteenMillisecondsScene } from './scene.js';
import { sixteenMillisecondsIRs } from './irs.js';
import { sixteenMillisecondsStageView } from './sixteen-milliseconds-stage.js';
import { sixteenMillisecondsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './sixteen-milliseconds-stage.js';
export * from './facet.js';

/** 이 조각을 레지스트리에 올린다. 호출은 호스트 몫이다. */
export function registerSixteenMilliseconds(): void {
  registerAlgorithm<SixteenMillisecondsFacetData>('sixteenMilliseconds', sixteenMilliseconds, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sixteenMillisecondsScene', sixteenMillisecondsScene);
  for (const ir of sixteenMillisecondsIRs) registerIR(ir.id, ir);
  registerView('sixteen-milliseconds-stage', sixteenMillisecondsStageView);
  registerFacets([sixteenMillisecondsFacet]);
}

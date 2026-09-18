/**
 * 지난 몇 번이 다음을 가리킨다 — 조각 진입점.
 *
 * 등록 순서는 S-facet 을 따른다. register 를 스스로 부르지 않는다 — 호출은 호스트의 몫.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { patternFromHistory, type PatternFromHistoryFacetData } from './algorithm.js';
import { patternFromHistoryFacet } from './facet.js';
import { patternFromHistoryIRs } from './irs.js';
import { patternFromHistoryStageView } from './pattern-from-history-stage.js';
import { patternFromHistoryScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './pattern-from-history-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerPatternFromHistory(): void {
  registerAlgorithm<PatternFromHistoryFacetData>('patternFromHistory', patternFromHistory, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('patternFromHistoryScene', patternFromHistoryScene);
  for (const ir of patternFromHistoryIRs) registerIR(ir.id, ir);
  registerView('pattern-from-history-stage', patternFromHistoryStageView);
  registerFacets([patternFromHistoryFacet]);
}

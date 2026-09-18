import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sameWordVsSameMeaning, type SameWordVsSameMeaningFacetData } from './algorithm.js';
import { sameWordVsSameMeaningFacet } from './facet.js';
import { sameWordVsSameMeaningIRs } from './irs.js';
import { sameWordVsSameMeaningScene } from './scene.js';
import { sameWordVsSameMeaningStageView } from './same-word-vs-same-meaning-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './same-word-vs-same-meaning-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerSameWordVsSameMeaning(): void {
  registerAlgorithm<SameWordVsSameMeaningFacetData>('sameWordVsSameMeaning', sameWordVsSameMeaning, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sameWordVsSameMeaningScene', sameWordVsSameMeaningScene);
  for (const ir of sameWordVsSameMeaningIRs) registerIR(ir.id, ir);
  registerView('same-word-vs-same-meaning-stage', sameWordVsSameMeaningStageView);
  registerFacets([sameWordVsSameMeaningFacet]);
}

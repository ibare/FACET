import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { carrySeveralLines, type CarrySeveralLinesFacetData } from './algorithm.js';
import { carrySeveralLinesScene } from './scene.js';
import { carrySeveralLinesStageView } from './carry-several-lines-stage.js';
import { carrySeveralLinesIRs } from './irs.js';
import { carrySeveralLinesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './carry-several-lines-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerCarrySeveralLines(): void {
  registerAlgorithm<CarrySeveralLinesFacetData>('carrySeveralLines', carrySeveralLines, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('carrySeveralLinesScene', carrySeveralLinesScene);
  for (const ir of carrySeveralLinesIRs) registerIR(ir.id, ir);
  registerView('carry-several-lines-stage', carrySeveralLinesStageView);
  registerFacets([carrySeveralLinesFacet]);
}

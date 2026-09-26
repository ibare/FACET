/** loss-measures-wrongness 조각 — 등록 진입점. 호출은 호스트 몫이다. */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { lossMeasuresWrongness, type LossMeasuresWrongnessFacetData } from './algorithm.js';
import { lossMeasuresWrongnessScene } from './scene.js';
import { lossMeasuresWrongnessIRs } from './irs.js';
import { lossMeasuresWrongnessStageView } from './loss-measures-wrongness-stage.js';
import { lossMeasuresWrongnessFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './loss-measures-wrongness-stage.js';
export * from './facet.js';

export function registerLossMeasuresWrongness(): void {
  registerAlgorithm<LossMeasuresWrongnessFacetData>('lossMeasuresWrongness', lossMeasuresWrongness, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('lossMeasuresWrongnessScene', lossMeasuresWrongnessScene);
  for (const ir of lossMeasuresWrongnessIRs) registerIR(ir.id, ir);
  registerView('loss-measures-wrongness-stage', lossMeasuresWrongnessStageView);
  registerFacets([lossMeasuresWrongnessFacet]);
}

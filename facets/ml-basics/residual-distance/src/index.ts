/**
 * 잔차 조각의 등록 진입점. 호출은 호스트 앱이 한다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { residualDistanceAlgorithm } from './algorithm.js';
import type { ResidualDistanceData } from './algorithm.js';
import { residualDistanceScene } from './scene.js';
import { residualDistanceIRs } from './irs.js';
import { residualDistanceStageView } from './residual-distance-stage.js';
import { residualDistanceFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './facet.js';
export * from './residual-distance-stage.js';

export function registerResidualDistance(): void {
  registerAlgorithm<ResidualDistanceData>('residualDistance', residualDistanceAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('residualDistanceScene', residualDistanceScene);
  for (const ir of residualDistanceIRs) registerIR(ir.id, ir);
  registerView('residual-distance-stage', residualDistanceStageView);
  registerFacets([residualDistanceFacet]);
}

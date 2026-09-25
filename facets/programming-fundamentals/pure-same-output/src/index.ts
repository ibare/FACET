/**
 * pure-same-output 조각 — 등록 진입점. 호출은 호스트 몫이다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pureSameOutput, type PureSameOutputFacetData } from './algorithm.js';
import { pureSameOutputScene } from './scene.js';
import { pureSameOutputStageView } from './pure-same-output-stage.js';
import { pureSameOutputIRs } from './irs.js';
import { pureSameOutputFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './pure-same-output-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerPureSameOutput(): void {
  registerAlgorithm<PureSameOutputFacetData>('pureSameOutput', pureSameOutput, { mechanismKind: 'reactive' });
  registerScenePlan('pureSameOutputScene', pureSameOutputScene);
  for (const ir of pureSameOutputIRs) registerIR(ir.id, ir);
  registerView('pure-same-output-stage', pureSameOutputStageView);
  registerFacets([pureSameOutputFacet]);
}

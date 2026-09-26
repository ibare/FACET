import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { agreeOnOneValue, type AgreeOnOneValueFacetData } from './algorithm.js';
import { agreeOnOneValueScene } from './scene.js';
import { agreeOnOneValueStageView } from './agree-on-one-value-stage.js';
import { agreeOnOneValueIRs } from './irs.js';
import { agreeOnOneValueFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './agree-on-one-value-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerAgreeOnOneValue(): void {
  registerAlgorithm<AgreeOnOneValueFacetData>('agreeOnOneValue', agreeOnOneValue, { mechanismKind: 'reactive' });
  registerScenePlan('agreeOnOneValueScene', agreeOnOneValueScene);
  for (const ir of agreeOnOneValueIRs) registerIR(ir.id, ir);
  registerView('agree-on-one-value-stage', agreeOnOneValueStageView);
  registerFacets([agreeOnOneValueFacet]);
}

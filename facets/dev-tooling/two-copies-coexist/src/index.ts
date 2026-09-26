import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { twoCopiesCoexist, type TwoCopiesCoexistFacetData } from './algorithm.js';
import { twoCopiesCoexistFacet } from './facet.js';
import { twoCopiesCoexistIRs } from './irs.js';
import { twoCopiesCoexistScene } from './scene.js';
import { twoCopiesCoexistStageView } from './two-copies-coexist-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export { twoCopiesCoexistStageView } from './two-copies-coexist-stage.js';
export { twoCopiesCoexistIRs } from './irs.js';
export { twoCopiesCoexistFacet } from './facet.js';

export function registerTwoCopiesCoexist(): void {
  registerAlgorithm<TwoCopiesCoexistFacetData>('twoCopiesCoexist', twoCopiesCoexist, { mechanismKind: 'reactive' });
  registerScenePlan('twoCopiesCoexistScene', twoCopiesCoexistScene);
  for (const ir of twoCopiesCoexistIRs) registerIR(ir.id, ir);
  registerView('two-copies-coexist-stage', twoCopiesCoexistStageView);
  registerFacets([twoCopiesCoexistFacet]);
}

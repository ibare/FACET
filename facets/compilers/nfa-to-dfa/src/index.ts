import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { nfaToDfa, type NfaToDfaFacetData } from './algorithm.js';
import { nfaToDfaFacet } from './facet.js';
import { nfaToDfaIRs } from './irs.js';
import { nfaToDfaStageView } from './nfa-to-dfa-stage.js';
import { nfaToDfaScene } from './scene.js';

export * from './algorithm.js';
export * from './scene.js';
export { nfaToDfaStageView } from './nfa-to-dfa-stage.js';
export { nfaToDfaIRs } from './irs.js';
export { nfaToDfaFacet } from './facet.js';

export function registerNfaToDfa(): void {
  registerAlgorithm<NfaToDfaFacetData>('nfaToDfa', nfaToDfa, { mechanismKind: 'reactive' });
  registerScenePlan('nfaToDfaScene', nfaToDfaScene);
  for (const ir of nfaToDfaIRs) registerIR(ir.id, ir);
  registerView('nfa-to-dfa-stage', nfaToDfaStageView);
  registerFacets([nfaToDfaFacet]);
}

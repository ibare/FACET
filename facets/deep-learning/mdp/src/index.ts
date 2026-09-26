import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { mdpAlgorithm, type MdpData } from './algorithm.js';
import { mdpFacet } from './facet.js';
import { mdpIRs } from './irs.js';
import { mdpStageView } from './mdp-stage.js';
import { mdpProjector } from './projector.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './mdp-stage.js';
export * from './projector.js';

/** mdp 완제품을 등록한다. 손잡이가 있어 reactive 로 올린다. */
export function registerMdp(): void {
  registerAlgorithm<MdpData>('mdp', mdpAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('mdpProjector', mdpProjector);
  for (const ir of mdpIRs) registerIR(ir.id, ir);
  registerView('mdp-stage', mdpStageView);
  registerFacets([mdpFacet]);
}

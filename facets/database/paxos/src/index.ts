import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { paxosAlgorithm, type PaxosData } from './algorithm.js';
import { paxosProjector } from './projector.js';
import { paxosIRs } from './irs.js';
import { paxosStageView } from './paxos-stage.js';
import { paxosFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './paxos-stage.js';
export * from './facet.js';

/** Paxos 완제품을 등록한다. 손잡이가 있어 reactive 로 돈다 */
export function registerPaxos(): void {
  registerAlgorithm<PaxosData>('paxos', paxosAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('paxosProjector', paxosProjector);
  for (const ir of paxosIRs) registerIR(ir.id, ir);
  registerView('paxos-stage', paxosStageView);
  registerFacets([paxosFacet]);
}

/**
 * tcp-handshake — TCP 와 UDP. 등록은 register 하나로.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { tcpHandshakeAlgorithm, type TcpHandshakeData } from './algorithm.js';
import { tcpHandshakeProjector } from './projector.js';
import { tcpHandshakeIRs } from './irs.js';
import { tcpHandshakeStageView } from './tcp-handshake-stage.js';
import { tcpHandshakeFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './tcp-handshake-stage.js';
export * from './facet.js';

export function registerTcpHandshake(): void {
  registerAlgorithm<TcpHandshakeData>('tcpHandshake', tcpHandshakeAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('tcpHandshakeProjector', tcpHandshakeProjector);
  for (const ir of tcpHandshakeIRs) registerIR(ir.id, ir);
  registerView('tcp-handshake-stage', tcpHandshakeStageView);
  registerFacets([tcpHandshakeFacet]);
}

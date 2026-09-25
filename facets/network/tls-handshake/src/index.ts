/**
 * TLS 핸드셰이크 — 등록. 호스트가 registerTlsHandshake() 를 부른다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { tlsHandshakeAlgorithm, type TlsHandshakeData } from './algorithm.js';
import { tlsHandshakeProjector } from './projector.js';
import { tlsHandshakeIRs } from './irs.js';
import { tlsHandshakeStageView } from './tls-handshake-stage.js';
import { tlsHandshakeFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './tls-handshake-stage.js';
export * from './facet.js';

export function registerTlsHandshake(): void {
  registerAlgorithm<TlsHandshakeData>('tlsHandshake', tlsHandshakeAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('tlsHandshakeProjector', tlsHandshakeProjector);
  for (const ir of tlsHandshakeIRs) registerIR(ir.id, ir);
  registerView('tls-handshake-stage', tlsHandshakeStageView);
  registerFacets([tlsHandshakeFacet]);
}

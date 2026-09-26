import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { certificateAlgorithm, type CertificateData } from './algorithm.js';
import { certificateProjector } from './projector.js';
import { certificateIRs } from './irs.js';
import { certificateStageView } from './certificate-stage.js';
import { certificateFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './certificate-stage.js';
export * from './facet.js';

export function registerCertificate(): void {
  registerAlgorithm<CertificateData>('certificate', certificateAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('certificateProjector', certificateProjector);
  for (const ir of certificateIRs) registerIR(ir.id, ir);
  registerView('certificate-stage', certificateStageView);
  registerFacets([certificateFacet]);
}

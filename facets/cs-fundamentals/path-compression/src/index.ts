import { registerAlgorithm, registerDescription, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';

import { pathCompressionAlgorithm } from './algorithm.js';
import { pathCompressionProjector } from './projector.js';
import { pathCompressionIRs } from './irs.js';
import { pathCompressionFacet } from './facet.js';
import { pathCompressionDescription } from './description.js';
import { pathCompressionStageView } from './path-compression-stage.js';

export { pathCompressionAlgorithm } from './algorithm.js';
export type { PathCompressionData } from './algorithm.js';
export { pathCompressionProjector } from './projector.js';
export { pathCompressionIRs } from './irs.js';
export { pathCompressionFacet } from './facet.js';
export { pathCompressionDescription } from './description.js';
export { pathCompressionStageView } from './path-compression-stage.js';

export function registerPathCompression(): void {
  registerAlgorithm('pathCompression', pathCompressionAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('pathCompressionProjector', pathCompressionProjector);
  for (const ir of pathCompressionIRs) registerIR(ir.id, ir);
  registerView('path-compression-stage', pathCompressionStageView);
  registerFacets([pathCompressionFacet]);
  registerDescription(pathCompressionFacet.id, pathCompressionDescription);
}

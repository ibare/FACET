import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { semanticVersioningAlgorithm, type SemanticVersioningData } from './algorithm.js';
import { semanticVersioningProjector } from './projector.js';
import { semanticVersioningIRs } from './irs.js';
import { semanticVersioningStageView } from './semantic-versioning-stage.js';
import { semanticVersioningFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './semantic-versioning-stage.js';
export * from './facet.js';

export function registerSemanticVersioning(): void {
  registerAlgorithm<SemanticVersioningData>('semanticVersioning', semanticVersioningAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('semanticVersioningProjector', semanticVersioningProjector);
  for (const ir of semanticVersioningIRs) registerIR(ir.id, ir);
  registerView('semantic-versioning-stage', semanticVersioningStageView);
  registerFacets([semanticVersioningFacet]);
}

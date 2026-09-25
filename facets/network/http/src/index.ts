import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { httpAlgorithm, type HttpData } from './algorithm.js';
import { httpProjector } from './projector.js';
import { httpIRs } from './irs.js';
import { httpStageView } from './http-stage.js';
import { httpFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './http-stage.js';
export * from './facet.js';

export function registerHttp(): void {
  registerAlgorithm<HttpData>('http', httpAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('httpProjector', httpProjector);
  for (const ir of httpIRs) registerIR(ir.id, ir);
  registerView('http-stage', httpStageView);
  registerFacets([httpFacet]);
}

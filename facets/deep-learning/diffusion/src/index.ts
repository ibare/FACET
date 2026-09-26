import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { diffusionAlgorithm, type DiffusionData } from './algorithm.js';
import { diffusionProjector } from './projector.js';
import { diffusionIRs } from './irs.js';
import { diffusionStageView } from './diffusion-stage.js';
import { diffusionFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './diffusion-stage.js';
export * from './facet.js';

export function registerDiffusion(): void {
  registerAlgorithm<DiffusionData>('diffusion', diffusionAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('diffusionProjector', diffusionProjector);
  for (const ir of diffusionIRs) registerIR(ir.id, ir);
  registerView('diffusion-stage', diffusionStageView);
  registerFacets([diffusionFacet]);
}

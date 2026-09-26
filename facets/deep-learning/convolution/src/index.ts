import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { convolutionAlgorithm, type ConvolutionData } from './algorithm.js';
import { convolutionFacet } from './facet.js';
import { convolutionIRs } from './irs.js';
import { convolutionProjector } from './projector.js';
import { convolutionStageView } from './convolution-stage.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './convolution-stage.js';
export * from './facet.js';

export function registerConvolution(): void {
  registerAlgorithm<ConvolutionData>('convolution', convolutionAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('convolutionProjector', convolutionProjector);
  for (const ir of convolutionIRs) registerIR(ir.id, ir);
  registerView('convolution-stage', convolutionStageView);
  registerFacets([convolutionFacet]);
}

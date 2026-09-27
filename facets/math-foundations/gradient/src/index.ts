/**
 * @ffacet/algorithm-gradient — 편미분과 그래디언트 완제품.
 *
 * registerGradient() 가 algorithm(reactive) · projector · IR · stage view · facet 을 차례로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { type GradientData, gradientAlgorithm } from './algorithm.js';
import { gradientFacet } from './facet.js';
import { gradientStageView } from './gradient-stage.js';
import { gradientIRs } from './irs.js';
import { gradientProjector } from './projector.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './gradient-stage.js';
export * from './facet.js';

export function registerGradient(): void {
  registerAlgorithm<GradientData>('gradient', gradientAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('gradientProjector', gradientProjector);
  for (const ir of gradientIRs) registerIR(ir.id, ir);
  registerView('gradient-stage', gradientStageView);
  registerFacets([gradientFacet]);
}

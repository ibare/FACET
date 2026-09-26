/**
 * 경사 하강 — 어느 바닥에 서는가. 등록 진입점.
 *
 * 손잡이(학습률 η · 출발 w₀)가 있어 알고리즘을 reactive 로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { gradientDescentAlgorithm, type GradientDescentData } from './algorithm.js';
import { gradientDescentProjector } from './projector.js';
import { gradientDescentIRs } from './irs.js';
import { gradientDescentStageView } from './gradient-descent-stage.js';
import { gradientDescentFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './gradient-descent-stage.js';
export * from './facet.js';

export function registerGradientDescent(): void {
  registerAlgorithm<GradientDescentData>('gradientDescent', gradientDescentAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('gradientDescentProjector', gradientDescentProjector);
  for (const ir of gradientDescentIRs) registerIR(ir.id, ir);
  registerView('gradient-descent-stage', gradientDescentStageView);
  registerFacets([gradientDescentFacet]);
}

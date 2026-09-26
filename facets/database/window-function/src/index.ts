/**
 * window-function — 윈도 함수는 줄을 남긴 채 이웃을 모은다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { windowFunctionAlgorithm, type WindowFunctionData } from './algorithm.js';
import { windowFunctionProjector } from './projector.js';
import { windowFunctionIRs } from './irs.js';
import { windowFunctionStageView } from './window-function-stage.js';
import { windowFunctionFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './window-function-stage.js';
export * from './facet.js';

export function registerWindowFunction(): void {
  registerAlgorithm<WindowFunctionData>('windowFunction', windowFunctionAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('windowFunctionProjector', windowFunctionProjector);
  for (const ir of windowFunctionIRs) registerIR(ir.id, ir);
  registerView('window-function-stage', windowFunctionStageView);
  registerFacets([windowFunctionFacet]);
}

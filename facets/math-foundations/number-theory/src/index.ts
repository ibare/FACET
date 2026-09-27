/**
 * number-theory — 등록 진입점. 호스트가 registerNumberTheory() 를 부른다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { numberTheoryAlgorithm, type NumberTheoryData } from './algorithm.js';
import { numberTheoryProjector } from './projector.js';
import { numberTheoryIRs } from './irs.js';
import { numberTheoryStageView } from './number-theory-stage.js';
import { numberTheoryFacet } from './facet.js';

export { numberTheoryAlgorithm, gcdSubtract, type NumberTheoryData, type NumberTheoryRound } from './algorithm.js';
export { numberTheoryProjector } from './projector.js';
export { numberTheoryImperativeIR, numberTheoryIRs } from './irs.js';
export { numberTheoryStageView, type NumberTheoryStage } from './number-theory-stage.js';
export { numberTheoryFacet } from './facet.js';

export function registerNumberTheory(): void {
  registerAlgorithm<NumberTheoryData>('numberTheory', numberTheoryAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('numberTheoryProjector', numberTheoryProjector);
  for (const ir of numberTheoryIRs) registerIR(ir.id, ir);
  registerView('number-theory-stage', numberTheoryStageView);
  registerFacets([numberTheoryFacet]);
}

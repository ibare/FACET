import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { myersDiffAlgorithm, type MyersDiffData } from './algorithm.js';
import { myersDiffFacet } from './facet.js';
import { myersDiffIRs } from './irs.js';
import { myersDiffStageView } from './myers-diff-stage.js';
import { myersDiffProjector } from './projector.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './myers-diff-stage.js';
export * from './facet.js';

export function registerMyersDiff(): void {
  registerAlgorithm<MyersDiffData>('myersDiff', myersDiffAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('myersDiffProjector', myersDiffProjector);
  for (const ir of myersDiffIRs) registerIR(ir.id, ir);
  registerView('myers-diff-stage', myersDiffStageView);
  registerFacets([myersDiffFacet]);
}

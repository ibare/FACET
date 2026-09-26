/**
 * regex-backtracking — 등록 진입점.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { regexBacktrackingAlgorithm, type RegexBacktrackingData } from './algorithm.js';
import { regexBacktrackingFacet } from './facet.js';
import { regexBacktrackingIRs } from './irs.js';
import { regexBacktrackingProjector } from './projector.js';
import { regexBacktrackingStageView } from './regex-backtracking-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './regex-backtracking-stage.js';

export function registerRegexBacktracking(): void {
  registerAlgorithm<RegexBacktrackingData>('regexBacktracking', regexBacktrackingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('regexBacktrackingProjector', regexBacktrackingProjector);
  for (const ir of regexBacktrackingIRs) registerIR(ir.id, ir);
  registerView('regex-backtracking-stage', regexBacktrackingStageView);
  registerFacets([regexBacktrackingFacet]);
}

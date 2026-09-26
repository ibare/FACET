import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { patternMatchesSet, type PatternMatchesSetFacetData } from './algorithm';
import { patternMatchesSetScene } from './scene';
import { patternMatchesSetStageView } from './pattern-matches-set-stage';
import { patternMatchesSetIRs } from './irs';
import { patternMatchesSetFacet } from './facet';

export * from './algorithm';
export * from './scene';
export { patternMatchesSetStageView } from './pattern-matches-set-stage';
export { patternMatchesSetIRs } from './irs';
export { patternMatchesSetFacet } from './facet';

export function registerPatternMatchesSet(): void {
  registerAlgorithm<PatternMatchesSetFacetData>('patternMatchesSet', patternMatchesSet, { mechanismKind: 'reactive' });
  registerScenePlan('patternMatchesSetScene', patternMatchesSetScene);
  for (const ir of patternMatchesSetIRs) registerIR(ir.id, ir);
  registerView('pattern-matches-set-stage', patternMatchesSetStageView);
  registerFacets([patternMatchesSetFacet]);
}

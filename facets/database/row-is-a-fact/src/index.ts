import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { rowIsAFact, type RowIsAFactFacetData } from './algorithm.js';
import { rowIsAFactScene } from './scene.js';
import { rowIsAFactIRs } from './irs.js';
import { rowIsAFactStageView } from './row-is-a-fact-stage.js';
import { rowIsAFactFacet } from './facet.js';

export { rowIsAFact, type RowIsAFactFacetData } from './algorithm.js';
export {
  rowIsAFactScene,
  type RowIsAFactScene,
  type RowIsAFactStep,
  type RowIsAFactAsked,
} from './scene.js';
export { rowIsAFactIRs } from './irs.js';
export { rowIsAFactStageView } from './row-is-a-fact-stage.js';
export { rowIsAFactFacet } from './facet.js';

export function registerRowIsAFact(): void {
  registerAlgorithm<RowIsAFactFacetData>('rowIsAFact', rowIsAFact, { mechanismKind: 'reactive' });
  registerScenePlan('rowIsAFactScene', rowIsAFactScene);
  for (const ir of rowIsAFactIRs) registerIR(ir.id, ir);
  registerView('row-is-a-fact-stage', rowIsAFactStageView);
  registerFacets([rowIsAFactFacet]);
}

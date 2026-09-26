import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { subqueryAlgorithm, type SubqueryData } from './algorithm.js';
import { subqueryProjector } from './projector.js';
import { subqueryIRs } from './irs.js';
import { subqueryStageView } from './subquery-stage.js';
import { subqueryFacet } from './facet.js';

export { subqueryAlgorithm, groupIndex } from './algorithm.js';
export type { SubqueryData, SubqueryForm, SubqueryRow } from './algorithm.js';
export { subqueryProjector } from './projector.js';
export { subqueryImperativeIR, subqueryIRs } from './irs.js';
export { subqueryStageView } from './subquery-stage.js';
export type { SubqueryStage, SubqueryStageRow } from './subquery-stage.js';
export { subqueryFacet } from './facet.js';

export function registerSubquery(): void {
  registerAlgorithm<SubqueryData>('subquery', subqueryAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('subqueryProjector', subqueryProjector);
  for (const ir of subqueryIRs) registerIR(ir.id, ir);
  registerView('subquery-stage', subqueryStageView);
  registerFacets([subqueryFacet]);
}

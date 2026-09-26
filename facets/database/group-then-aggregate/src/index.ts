import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { groupThenAggregate, type GroupThenAggregateFacetData } from './algorithm.js';
import { groupThenAggregateScene } from './scene.js';
import { groupThenAggregateStageView } from './group-then-aggregate-stage.js';
import { groupThenAggregateIRs } from './irs.js';
import { groupThenAggregateFacet } from './facet.js';

export {
  groupThenAggregate,
  groupRows,
  readGroupThenAggregateData,
  type GroupThenAggregateFacetData,
  type GroupOf,
  type OrderRow,
} from './algorithm.js';
export {
  groupThenAggregateScene,
  type GroupThenAggregateScene,
  type GroupThenAggregateStep,
  type GatheredGroup,
  type FoldedRow,
} from './scene.js';
export { groupThenAggregateStageView } from './group-then-aggregate-stage.js';
export { groupThenAggregateIRs } from './irs.js';
export { groupThenAggregateFacet } from './facet.js';

export function registerGroupThenAggregate(): void {
  registerAlgorithm<GroupThenAggregateFacetData>('groupThenAggregate', groupThenAggregate, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('groupThenAggregateScene', groupThenAggregateScene);
  for (const ir of groupThenAggregateIRs) registerIR(ir.id, ir);
  registerView('group-then-aggregate-stage', groupThenAggregateStageView);
  registerFacets([groupThenAggregateFacet]);
}

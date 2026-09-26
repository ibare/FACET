import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { hotShard, type HotShardFacetData } from './algorithm.js';
import { hotShardScene } from './scene.js';
import { hotShardStageView } from './hot-shard-stage.js';
import { hotShardIRs } from './irs.js';
import { hotShardFacet } from './facet.js';

export { hotShard, narrowHotShardData, shardOf } from './algorithm.js';
export type { HotShardFacetData, ShardRange } from './algorithm.js';
export { hotShardScene } from './scene.js';
export type { HotShardScene, HotShardRow, HotShardStep } from './scene.js';
export { hotShardStageView } from './hot-shard-stage.js';
export { hotShardIRs } from './irs.js';
export { hotShardFacet } from './facet.js';

export function registerHotShard(): void {
  registerAlgorithm<HotShardFacetData>('hotShard', hotShard, { mechanismKind: 'reactive' });
  registerScenePlan('hotShardScene', hotShardScene);
  for (const ir of hotShardIRs) registerIR(ir.id, ir);
  registerView('hot-shard-stage', hotShardStageView);
  registerFacets([hotShardFacet]);
}

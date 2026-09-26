/**
 * sharding — 해시와 구간으로 샤드를 나눌 때 새 쓰기의 몰림과 범위 질의가 여는 샤드 수가 맞바뀌는 것을 보이는 완제품.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { shardingAlgorithm, type ShardingData } from './algorithm.js';
import { shardingProjector } from './projector.js';
import { shardingIRs } from './irs.js';
import { shardingStageView } from './sharding-stage.js';
import { shardingFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './sharding-stage.js';
export * from './facet.js';

export function registerSharding(): void {
  registerAlgorithm<ShardingData>('sharding', shardingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('shardingProjector', shardingProjector);
  for (const ir of shardingIRs) registerIR(ir.id, ir);
  registerView('sharding-stage', shardingStageView);
  registerFacets([shardingFacet]);
}

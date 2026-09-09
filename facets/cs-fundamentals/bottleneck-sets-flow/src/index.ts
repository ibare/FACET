/**
 * bottleneck-sets-flow 등록 진입점.
 *
 * 호출은 호스트가 한다 — 이 파일은 사이드 이펙트로 스스로 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { bottleneckSetsFlowAlgorithm } from './algorithm.js';
import type { BottleneckSetsFlowData, FlowPipe } from './algorithm.js';
import { bottleneckSetsFlowProjector } from './projector.js';
import { bottleneckSetsFlowIRs } from './irs.js';
import { bottleneckSetsFlowStageView } from './bottleneck-sets-flow-stage.js';
import { bottleneckSetsFlowFacet } from './facet.js';
import { bottleneckSetsFlowDescription } from './description.js';

export function registerBottleneckSetsFlow(): void {
  registerAlgorithm<BottleneckSetsFlowData>('bottleneckSetsFlow', bottleneckSetsFlowAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('bottleneckSetsFlowProjector', bottleneckSetsFlowProjector);
  for (const ir of bottleneckSetsFlowIRs) registerIR(ir.id, ir);
  registerView('bottleneck-sets-flow-stage', bottleneckSetsFlowStageView);
  registerFacets([bottleneckSetsFlowFacet]);
  registerDescription(bottleneckSetsFlowFacet.id, bottleneckSetsFlowDescription);
}

export {
  bottleneckSetsFlowAlgorithm,
  bottleneckSetsFlowProjector,
  bottleneckSetsFlowIRs,
  bottleneckSetsFlowStageView,
  bottleneckSetsFlowFacet,
  bottleneckSetsFlowDescription,
};
export type { BottleneckSetsFlowData, FlowPipe };

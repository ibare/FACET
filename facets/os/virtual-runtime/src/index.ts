import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { virtualRuntime, type VirtualRuntimeFacetData } from './algorithm';
import { virtualRuntimeScene } from './scene';
import { virtualRuntimeStageView } from './virtual-runtime-stage';
import { virtualRuntimeIRs } from './irs';
import { virtualRuntimeFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './virtual-runtime-stage';
export * from './irs';
export * from './facet';

export function registerVirtualRuntime(): void {
  registerAlgorithm<VirtualRuntimeFacetData>('virtualRuntime', virtualRuntime, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('virtualRuntimeScene', virtualRuntimeScene);
  for (const ir of virtualRuntimeIRs) registerIR(ir.id, ir);
  registerView('virtual-runtime-stage', virtualRuntimeStageView);
  registerFacets([virtualRuntimeFacet]);
}

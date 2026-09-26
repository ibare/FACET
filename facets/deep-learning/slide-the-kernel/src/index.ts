import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { slideTheKernel, type SlideTheKernelFacetData } from './algorithm.js';
import { slideTheKernelScene } from './scene.js';
import { slideTheKernelIRs } from './irs.js';
import { slideTheKernelStageView } from './slide-the-kernel-stage.js';
import { slideTheKernelFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './slide-the-kernel-stage.js';
export * from './facet.js';

export function registerSlideTheKernel(): void {
  registerAlgorithm<SlideTheKernelFacetData>('slideTheKernel', slideTheKernel, { mechanismKind: 'reactive' });
  registerScenePlan('slideTheKernelScene', slideTheKernelScene);
  for (const ir of slideTheKernelIRs) registerIR(ir.id, ir);
  registerView('slide-the-kernel-stage', slideTheKernelStageView);
  registerFacets([slideTheKernelFacet]);
}

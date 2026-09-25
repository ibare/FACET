import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { fixedSizeFrames, type FixedSizeFramesFacetData } from './algorithm.js';
import { fixedSizeFramesScene } from './scene.js';
import { fixedSizeFramesIRs } from './irs.js';
import { fixedSizeFramesStageView } from './fixed-size-frames-stage.js';
import { fixedSizeFramesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './fixed-size-frames-stage.js';
export * from './facet.js';

export function registerFixedSizeFrames(): void {
  registerAlgorithm<FixedSizeFramesFacetData>('fixedSizeFrames', fixedSizeFrames, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('fixedSizeFramesScene', fixedSizeFramesScene);
  for (const ir of fixedSizeFramesIRs) registerIR(ir.id, ir);
  registerView('fixed-size-frames-stage', fixedSizeFramesStageView);
  registerFacets([fixedSizeFramesFacet]);
}

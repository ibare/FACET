import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sampleAndDecode, type SampleAndDecodeFacetData } from './algorithm.js';
import { sampleAndDecodeScene } from './scene.js';
import { sampleAndDecodeIRs } from './irs.js';
import { sampleAndDecodeStageView } from './sample-and-decode-stage.js';
import { sampleAndDecodeFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './sample-and-decode-stage.js';
export * from './facet.js';

export function registerSampleAndDecode(): void {
  registerAlgorithm<SampleAndDecodeFacetData>('sampleAndDecode', sampleAndDecode, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sampleAndDecodeScene', sampleAndDecodeScene);
  for (const ir of sampleAndDecodeIRs) registerIR(ir.id, ir);
  registerView('sample-and-decode-stage', sampleAndDecodeStageView);
  registerFacets([sampleAndDecodeFacet]);
}

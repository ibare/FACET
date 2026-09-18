/**
 * greedyDecoding — 등록 진입점. `registerGreedyDecoding()` 은 호스트가 부른다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { greedyDecodingAlgorithm } from './algorithm.js';
import { greedyDecodingProjector } from './projector.js';
import { greedyDecodingIRs } from './irs.js';
import { greedyDecodingStageView } from './greedy-decoding-stage.js';
import { greedyDecodingFacet } from './facet.js';

export {
  greedyDecodingAlgorithm,
  computeGreedyDecodingResult,
  narrowGreedyDecodingData,
  toPermille,
  lastWord,
} from './algorithm.js';
export type {
  GreedyDecodingData,
  GreedyDecodingOption,
  GreedyDecodingRow,
  GreedyDecodingStep,
  GreedyDecodingResult,
} from './algorithm.js';
export { greedyDecodingProjector } from './projector.js';
export { greedyDecodingImperativeIR, greedyDecodingIRs } from './irs.js';
export { greedyDecodingStageView } from './greedy-decoding-stage.js';
export type { GreedyDecodingStageApi } from './greedy-decoding-stage.js';
export { greedyDecodingFacet } from './facet.js';

export function registerGreedyDecoding(): void {
  registerAlgorithm('greedyDecoding', greedyDecodingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('greedyDecodingProjector', greedyDecodingProjector);
  for (const ir of greedyDecodingIRs) registerIR(ir.id, ir);
  registerView('greedy-decoding-stage', greedyDecodingStageView);
  registerFacets([greedyDecodingFacet]);
}

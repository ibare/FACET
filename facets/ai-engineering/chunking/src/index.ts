import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { chunkingAlgorithm, type ChunkingData } from './algorithm.js';
import { chunkingProjector } from './projector.js';
import { chunkingIRs } from './irs.js';
import { chunkingStageView } from './chunking-stage.js';
import { chunkingFacet } from './facet.js';

export {
  chunkingAlgorithm,
  computeChunkingResult,
  cutChunks,
  cutByWords,
  cutBySentences,
  brokenSentences,
  sentenceSpans,
  splitWords,
  fillPercent,
  type ChunkingData,
  type ChunkingResult,
  type Chunk,
  type Sentence,
} from './algorithm.js';
export { chunkingProjector } from './projector.js';
export { chunkingImperativeIR, chunkingIRs } from './irs.js';
export { chunkingStageView, type ChunkingStage } from './chunking-stage.js';
export { chunkingFacet } from './facet.js';

export function registerChunking(): void {
  registerAlgorithm<ChunkingData>('chunking', chunkingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('chunkingProjector', chunkingProjector);
  for (const ir of chunkingIRs) registerIR(ir.id, ir);
  registerView('chunking-stage', chunkingStageView);
  registerFacets([chunkingFacet]);
}

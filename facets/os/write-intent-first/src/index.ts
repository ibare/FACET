import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { writeIntentFirst, type WriteIntentFirstFacetData } from './algorithm.js';
import { writeIntentFirstScene } from './scene.js';
import { writeIntentFirstIRs } from './irs.js';
import { writeIntentFirstStageView } from './write-intent-first-stage.js';
import { writeIntentFirstFacet } from './facet.js';

export { writeIntentFirst, readWriteIntentFirstData, type WriteIntentFirstFacetData } from './algorithm.js';
export {
  writeIntentFirstScene,
  type WriteIntentFirstScene,
  type WriteIntentFirstStep,
  type JournalEntry,
  type HomeBlock,
} from './scene.js';
export { writeIntentFirstIRs } from './irs.js';
export { writeIntentFirstStageView } from './write-intent-first-stage.js';
export { writeIntentFirstFacet } from './facet.js';

export function registerWriteIntentFirst(): void {
  registerAlgorithm<WriteIntentFirstFacetData>('writeIntentFirst', writeIntentFirst, { mechanismKind: 'reactive' });
  registerScenePlan('writeIntentFirstScene', writeIntentFirstScene);
  for (const ir of writeIntentFirstIRs) registerIR(ir.id, ir);
  registerView('write-intent-first-stage', writeIntentFirstStageView);
  registerFacets([writeIntentFirstFacet]);
}

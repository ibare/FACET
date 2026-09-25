import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { mutexAlgorithm, type MutexData } from './algorithm.js';
import { mutexFacet } from './facet.js';
import { mutexIRs } from './irs.js';
import { mutexStageView } from './mutex-stage.js';
import { mutexProjector } from './projector.js';

export { mutexAlgorithm, runMutex } from './algorithm.js';
export type { MutexChunk, MutexData, MutexLine, MutexRun, MutexTick } from './algorithm.js';
export { mutexProjector } from './projector.js';
export { mutexIRs } from './irs.js';
export { mutexStageView } from './mutex-stage.js';
export type { MutexStage, StageChunk, StageRound, StageTick } from './mutex-stage.js';
export { mutexFacet } from './facet.js';

/** mutex 를 등록한다. 손잡이가 있어 reactive 로 돈다. */
export function registerMutex(): void {
  registerAlgorithm<MutexData>('mutex', mutexAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('mutexProjector', mutexProjector);
  for (const ir of mutexIRs) registerIR(ir.id, ir);
  registerView('mutex-stage', mutexStageView);
  registerFacets([mutexFacet]);
}

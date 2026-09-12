/**
 * write-back vs write-through 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { writeBackVsThroughAlgorithm, type WriteBackVsThroughData } from './algorithm.js';
import { writeBackVsThroughDescription } from './description.js';
import { writeBackVsThroughFacet } from './facet.js';
import { writeBackVsThroughIRs } from './irs.js';
import { writeBackVsThroughProjector } from './projector.js';
import { writeBackVsThroughStageView } from './write-back-vs-through-stage.js';

export { writeBackVsThroughAlgorithm, type WriteBackVsThroughData } from './algorithm.js';
export { writeBackVsThroughDescription } from './description.js';
export { writeBackVsThroughFacet } from './facet.js';
export { writeBackVsThroughIRs } from './irs.js';
export { writeBackVsThroughProjector } from './projector.js';
export {
  writeBackVsThroughStageView,
  type WriteBackStepView,
  type WriteBackFlushView,
  type WriteBackDoneView,
} from './write-back-vs-through-stage.js';

export function registerWriteBackVsThrough(): void {
  registerAlgorithm<WriteBackVsThroughData>('writeBackVsThrough', writeBackVsThroughAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('writeBackVsThroughProjector', writeBackVsThroughProjector);
  for (const ir of writeBackVsThroughIRs) registerIR(ir.id, ir);
  registerView('write-back-vs-through-stage', writeBackVsThroughStageView);
  registerFacets([writeBackVsThroughFacet]);
  registerDescription(writeBackVsThroughFacet.id, writeBackVsThroughDescription);
}

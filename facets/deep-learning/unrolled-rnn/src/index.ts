/**
 * 펼친 RNN 과 시간 역전파 — 등록 진입점.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { unrolledRnnAlgorithm, type UnrolledRnnData } from './algorithm.js';
import { unrolledRnnProjector } from './projector.js';
import { unrolledRnnIRs } from './irs.js';
import { unrolledRnnStageView } from './unrolled-rnn-stage.js';
import { unrolledRnnFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './unrolled-rnn-stage.js';
export * from './facet.js';

export function registerUnrolledRnn(): void {
  registerAlgorithm<UnrolledRnnData>('unrolledRnn', unrolledRnnAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('unrolledRnnProjector', unrolledRnnProjector);
  for (const ir of unrolledRnnIRs) registerIR(ir.id, ir);
  registerView('unrolled-rnn-stage', unrolledRnnStageView);
  registerFacets([unrolledRnnFacet]);
}

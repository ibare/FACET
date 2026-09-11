/**
 * hyperloglog 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 부르는 책임은 호스트 앱에 있다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { hyperloglogAlgorithm } from './algorithm.js';
import { hyperloglogProjector } from './projector.js';
import { hyperloglogIRs } from './irs.js';
import { hyperloglogStageView } from './hyperloglog-stage.js';
import { hyperloglogFacet } from './facet.js';
import { hyperloglogDescription } from './description.js';

export { hyperloglogAlgorithm, type HyperLogLogData } from './algorithm.js';
export { hyperloglogProjector } from './projector.js';
export { hyperloglogIRs } from './irs.js';
export { hyperloglogStageView, type HyperLogLogKeyFrame } from './hyperloglog-stage.js';
export { hyperloglogFacet } from './facet.js';
export { hyperloglogDescription } from './description.js';

export function registerHyperloglog(): void {
  registerAlgorithm('hyperloglog', hyperloglogAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('hyperloglogProjector', hyperloglogProjector);
  for (const ir of hyperloglogIRs) registerIR(ir.id, ir);
  registerView('hyperloglog-stage', hyperloglogStageView);
  registerFacets([hyperloglogFacet]);
  registerDescription(hyperloglogFacet.id, hyperloglogDescription);
}

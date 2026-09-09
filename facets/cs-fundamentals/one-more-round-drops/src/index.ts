/**
 * one-more-round-drops 등록 진입점.
 *
 * 부르는 것은 호스트 앱의 몫이다 — 이 파일은 사이드 이펙트로 스스로 부르지
 * 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { oneMoreRoundDropsAlgorithm } from './algorithm.js';
import type { OneMoreRoundDropsData } from './algorithm.js';
import { oneMoreRoundDropsProjector } from './projector.js';
import { oneMoreRoundDropsIRs } from './irs.js';
import { oneMoreRoundDropsStageView } from './one-more-round-drops-stage.js';
import { oneMoreRoundDropsFacet } from './facet.js';
import { oneMoreRoundDropsDescription } from './description.js';

export function registerOneMoreRoundDrops(): void {
  registerAlgorithm<OneMoreRoundDropsData>('oneMoreRoundDrops', oneMoreRoundDropsAlgorithm, {
    // 조각은 mount 하면 스스로 재생을 시작하고 걸음 간격을 스스로 정한다 (S-piece).
    mechanismKind: 'reactive',
  });
  registerProjector('oneMoreRoundDropsProjector', oneMoreRoundDropsProjector);
  for (const ir of oneMoreRoundDropsIRs) registerIR(ir.id, ir);
  registerView('one-more-round-drops-stage', oneMoreRoundDropsStageView);
  registerFacets([oneMoreRoundDropsFacet]);
  registerDescription(oneMoreRoundDropsFacet.id, oneMoreRoundDropsDescription);
}

export {
  oneMoreRoundDropsAlgorithm,
  simulateOneMoreRoundDrops,
} from './algorithm.js';
export type {
  OneMoreRoundDropsData,
  OneMoreRoundDropsEdge,
  OneMoreRoundDropsEntry,
  OneMoreRoundDropsRun,
} from './algorithm.js';
export { oneMoreRoundDropsProjector } from './projector.js';
export { oneMoreRoundDropsIRs } from './irs.js';
export { oneMoreRoundDropsStageView } from './one-more-round-drops-stage.js';
export { oneMoreRoundDropsFacet } from './facet.js';
export { oneMoreRoundDropsDescription } from './description.js';

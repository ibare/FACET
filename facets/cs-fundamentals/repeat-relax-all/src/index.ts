/**
 * repeatRelaxAll 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { repeatRelaxAllAlgorithm, type RelaxEdge, type RepeatRelaxAllData } from './algorithm.js';
import { repeatRelaxAllProjector } from './projector.js';
import { repeatRelaxAllIRs } from './irs.js';
import { repeatRelaxAllFacet } from './facet.js';
import { repeatRelaxAllDescription } from './description.js';
import { repeatRelaxAllStageView } from './repeat-relax-all-stage.js';

export {
  repeatRelaxAllAlgorithm,
  repeatRelaxAllProjector,
  repeatRelaxAllIRs,
  repeatRelaxAllFacet,
  repeatRelaxAllDescription,
  repeatRelaxAllStageView,
};
export type { RelaxEdge, RepeatRelaxAllData };

export function registerRepeatRelaxAll(): void {
  registerAlgorithm<RepeatRelaxAllData>('repeatRelaxAll', repeatRelaxAllAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('repeatRelaxAllProjector', repeatRelaxAllProjector);
  for (const ir of repeatRelaxAllIRs) registerIR(ir.id, ir);
  registerView('repeat-relax-all-stage', repeatRelaxAllStageView);
  registerFacets([repeatRelaxAllFacet]);
  registerDescription(repeatRelaxAllFacet.id, repeatRelaxAllDescription);
}

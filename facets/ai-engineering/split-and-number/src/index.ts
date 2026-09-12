/**
 * 쪼개서 번호로 — 등록 진입점.
 *
 * 부르는 책임은 호스트 앱에 있다. 이 파일은 사이드 이펙트로 스스로 등록하지
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

import { splitAndNumberAlgorithm } from './algorithm.js';
import type { SplitAndNumberData } from './algorithm.js';
import { splitAndNumberProjector } from './projector.js';
import { splitAndNumberIRs } from './irs.js';
import { splitAndNumberStageView } from './split-and-number-stage.js';
import { splitAndNumberFacet } from './facet.js';
import { splitAndNumberDescription } from './description.js';

export function registerSplitAndNumber(): void {
  // mechanismKind 를 선언하는 자리는 facet.ts 가 아니라 여기다. 조각은 마운트하면
  // 스스로 재생하고 걸음 간격을 스스로 정해야 하므로 reactive 다 (S-piece).
  registerAlgorithm<SplitAndNumberData>('splitAndNumber', splitAndNumberAlgorithm, {
    mechanismKind: 'reactive',
  });
  // algorithm 과 같은 이름으로 등록하지 않는다 — `module:` 참조가 어느 쪽인지
  // 말하지 못하게 된다 (C4).
  registerProjector('splitAndNumberProjector', splitAndNumberProjector);
  for (const ir of splitAndNumberIRs) registerIR(ir.id, ir);
  registerView('split-and-number-stage', splitAndNumberStageView);
  registerFacets([splitAndNumberFacet]);
  registerDescription(splitAndNumberFacet.id, splitAndNumberDescription);
}

export {
  splitAndNumberAlgorithm,
  splitAndNumberProjector,
  splitAndNumberIRs,
  splitAndNumberStageView,
  splitAndNumberFacet,
  splitAndNumberDescription,
};
export type { SplitAndNumberData };

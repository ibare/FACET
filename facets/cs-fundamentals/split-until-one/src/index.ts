/**
 * splitUntilOne 등록 진입점.
 *
 * 사이드 이펙트로 자동 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { splitUntilOneAlgorithm } from './algorithm.js';
import { splitUntilOneProjector } from './projector.js';
import { splitUntilOneIRs } from './irs.js';
import { splitUntilOneStageView } from './split-until-one-stage.js';
import { splitUntilOneFacet } from './facet.js';
import { splitUntilOneDescription } from './description.js';

export { splitUntilOneAlgorithm, computeSplitUntilOnePlan } from './algorithm.js';
export type {
  SplitUntilOneData,
  SplitGroup,
  SplitStep,
  SplitPlan,
} from './algorithm.js';
export { splitUntilOneProjector } from './projector.js';
export { splitUntilOneIRs } from './irs.js';
export { splitUntilOneStageView } from './split-until-one-stage.js';
export type { SplitFrameSpec, SplitTearSpec } from './split-until-one-stage.js';
export { splitUntilOneFacet } from './facet.js';
export { splitUntilOneDescription } from './description.js';

export function registerSplitUntilOne(): void {
  // reactive — 조각은 컨트롤바 없이 스스로 시작하고 걸음 간격도 스스로 정한다 (S-piece).
  registerAlgorithm('splitUntilOne', splitUntilOneAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('splitUntilOneProjector', splitUntilOneProjector);
  for (const ir of splitUntilOneIRs) registerIR(ir.id, ir);
  registerView('split-until-one-stage', splitUntilOneStageView);
  registerFacets([splitUntilOneFacet]);
  registerDescription(splitUntilOneFacet.id, splitUntilOneDescription);
}

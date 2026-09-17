/**
 * bad-char-skip 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { badCharSkipAlgorithm, type BadCharSkipData } from './algorithm.js';
import { badCharSkipScene } from './scene.js';
import { badCharSkipIRs } from './irs.js';
import { badCharSkipStageView } from './bad-char-skip-stage.js';
import { badCharSkipFacet } from './facet.js';

export { badCharSkipAlgorithm, badCharSlots, lastStandOf } from './algorithm.js';
export type { BadCharSkipData, BadCharSlot } from './algorithm.js';
export { badCharSkipScene, type BadCharSkipScene } from './scene.js';
export { badCharSkipIRs } from './irs.js';
export { badCharSkipStageView } from './bad-char-skip-stage.js';
export { badCharSkipFacet } from './facet.js';

export function registerBadCharSkip(): void {
  // 조각은 스스로 시작하고 걸음 간격도 스스로 정한다 — reactive 만 그 둘을 준다 (S-piece).
  registerAlgorithm<BadCharSkipData>('badCharSkip', badCharSkipAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('badCharSkipScene', badCharSkipScene);
  for (const ir of badCharSkipIRs) registerIR(ir.id, ir);
  registerView('bad-char-skip-stage', badCharSkipStageView);
  registerFacets([badCharSkipFacet]);
}

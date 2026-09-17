import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { bitwiseOpsAlgorithm, type BitwiseOpsData } from './algorithm.js';
import { bitwiseOpsProjector } from './projector.js';
import { bitwiseOpsIRs, bitwiseOpsImperativeIR } from './irs.js';
import { bitwiseOpsStageView } from './bitwise-ops-stage.js';
import { bitwiseOpsFacet } from './facet.js';

/**
 * 등록 진입점. 호출 책임은 호스트 앱에 있다 — 이 모듈은 import 만으로 아무것도
 * 등록하지 않는다 (S-facet).
 */
export function registerBitwiseOps(): void {
  // 손잡이가 논증을 지므로 reactive 다. 고른 연산이 algorithm 까지 닿는 길은
  // dispatch → waitForInput 하나뿐이고 coroutine 은 그 길을 갖지 않는다
  // (까닭은 algorithm.ts 머리 주석).
  registerAlgorithm<BitwiseOpsData>('bitwiseOps', bitwiseOpsAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('bitwiseOpsProjector', bitwiseOpsProjector);
  for (const ir of bitwiseOpsIRs) registerIR(ir.id, ir);
  registerView('bitwise-ops-stage', bitwiseOpsStageView);
  registerFacets([bitwiseOpsFacet]);
}

export {
  bitwiseOpsAlgorithm,
  bitwiseOpsProjector,
  bitwiseOpsIRs,
  bitwiseOpsImperativeIR,
  bitwiseOpsStageView,
  bitwiseOpsFacet,
};
export { computeBitwiseOpsResult, bitsOf, topWeight } from './algorithm.js';
export type { BitwiseOpsData, BitwiseOpsOutcome } from './algorithm.js';

/**
 * @ffacet/algorithm-hash-integrity-check — 무결성 대조 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 걸음을 자동 재생하고 정지하며, 다시 보기와 띠
 * 외에는 조작을 받지 않는다.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene). 부르는 책임은 호스트에 있다 — 여기서 사이드 이펙트로 부르지 않는다
 * (S-facet).
 */

export {
  hashIntegrityCheck,
  firstDiffIndex,
  type HashIntegrityFacetData,
  type ReceivedItem,
} from './algorithm.js';
export { hashIntegrityCheckIRs } from './irs.js';
export { hashIntegrityCheckFacet } from './facet.js';
export { integrityStageView } from './integrity-stage.js';
export {
  hashIntegrityCheckScene,
  type IntegrityBase,
  type IntegrityCaption,
  type IntegrityItem,
  type IntegrityScene,
  type IntegritySide,
  type IntegrityStep,
} from './scene.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { hashIntegrityCheck, type HashIntegrityFacetData } from './algorithm.js';
import { hashIntegrityCheckIRs } from './irs.js';
import { hashIntegrityCheckFacet } from './facet.js';
import { integrityStageView } from './integrity-stage.js';
import { hashIntegrityCheckScene } from './scene.js';

export function registerHashIntegrityCheck(): void {
  registerAlgorithm<HashIntegrityFacetData>('hashIntegrityCheck', hashIntegrityCheck, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('hashIntegrityCheckScene', hashIntegrityCheckScene);
  for (const ir of hashIntegrityCheckIRs) registerIR(ir.id, ir);
  registerView('integrity-stage', integrityStageView);
  registerFacets([hashIntegrityCheckFacet]);
}

/**
 * @ffacet/algorithm-kmp — 등록 진입점.
 *
 * 등록은 호스트 앱의 책임이다. 이 모듈은 사이드 이펙트로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { kmpAlgorithm, type KmpData } from './algorithm.js';
import { kmpProjector } from './projector.js';
import { kmpIRs } from './irs.js';
import { kmpStageView } from './kmp-stage.js';
import { kmpFacet } from './facet.js';
import { kmpDescription } from './description.js';

export { kmpAlgorithm, kmpProjector, kmpIRs, kmpStageView, kmpFacet, kmpDescription };
export {
  computeKmpRun,
  kmpFailure,
  kmpFailureByDefinition,
  kmpScan,
  kmpTableCompares,
  naiveScan,
  pickPattern,
  KMP_LENGTH_CHOICES,
} from './algorithm.js';
export type { KmpData, KmpRun, KmpScan, KmpSpot } from './algorithm.js';
export { kmpImperativeIR } from './irs.js';

export function registerKmp(): void {
  // 손잡이가 있는 완제품은 reactive 다 — 독자가 미는 것이 곧 다음 판이다.
  registerAlgorithm<KmpData>('kmp', kmpAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('kmpProjector', kmpProjector);
  for (const ir of kmpIRs) registerIR(ir.id, ir);
  registerView('kmp-stage', kmpStageView);
  registerFacets([kmpFacet]);
  registerDescription(kmpFacet.id, kmpDescription);
}

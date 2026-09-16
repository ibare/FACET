/**
 * verify-vs-find 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import {
  computeVerifyVsFindResult,
  expandCandidate,
  verifyVsFind,
  type VerifyVsFindData,
} from './algorithm.js';
import { verifyVsFindScene } from './scene.js';
import { verifyVsFindIRs } from './irs.js';
import { verifyVsFindStageView } from './verify-vs-find-stage.js';
import { verifyVsFindFacet } from './facet.js';
import { verifyVsFindDescription } from './description.js';

export function registerVerifyVsFind(): void {
  registerAlgorithm<VerifyVsFindData>('verifyVsFind', verifyVsFind, { mechanismKind: 'reactive' });
  registerScenePlan('verifyVsFindScene', verifyVsFindScene);
  for (const ir of verifyVsFindIRs) registerIR(ir.id, ir);
  registerView('verify-vs-find-stage', verifyVsFindStageView);
  registerFacets([verifyVsFindFacet]);
  registerDescription(verifyVsFindFacet.id, verifyVsFindDescription);
}

export {
  computeVerifyVsFindResult,
  expandCandidate,
  verifyVsFind,
  verifyVsFindDescription,
  verifyVsFindFacet,
  verifyVsFindIRs,
  verifyVsFindScene,
  verifyVsFindStageView,
};
export { candidateCount, findSeen, verifySeen } from './scene.js';
export type { VerifyVsFindData } from './algorithm.js';
export type { VerifyVsFindCandidate, VerifyVsFindResult } from './algorithm.js';
export type {
  VerifyVsFindScene,
  VerifyVsFindSceneCaption,
  VerifyVsFindSceneStep,
} from './scene.js';

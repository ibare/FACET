/**
 * false-sharing 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다
 * (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { falseSharingAlgorithm, type FalseSharingData } from './algorithm.js';
import { falseSharingDescription } from './description.js';
import { falseSharingFacet } from './facet.js';
import { falseSharingStageView } from './false-sharing-stage.js';
import { falseSharingIRs } from './irs.js';
import { falseSharingScene } from './scene.js';

export { falseSharingAlgorithm, type FalseSharingData } from './algorithm.js';
export { falseSharingDescription } from './description.js';
export { falseSharingFacet } from './facet.js';
export { falseSharingStageView } from './false-sharing-stage.js';
export { falseSharingIRs } from './irs.js';
export { falseSharingScene } from './scene.js';
export { falseSharingLine } from './algorithm.js';
export type {
  FalseSharingScene,
  Arrangement,
  WriteMark,
  WriteRound,
  FalseSharingStep,
  FalseSharingCaption,
  CoreMark,
} from './scene.js';

export function registerFalseSharing(): void {
  registerAlgorithm<FalseSharingData>('falseSharing', falseSharingAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('falseSharingScene', falseSharingScene);
  for (const ir of falseSharingIRs) registerIR(ir.id, ir);
  registerView('false-sharing-stage', falseSharingStageView);
  registerFacets([falseSharingFacet]);
  registerDescription(falseSharingFacet.id, falseSharingDescription);
}

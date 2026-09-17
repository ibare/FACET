/**
 * 전부 견주기 조각의 등록 진입점.
 *
 * 사이드 이펙트로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { compareWithAllAlgorithm } from './algorithm.js';
import type { CompareWithAllData } from './algorithm.js';
import { compareWithAllScene } from './scene.js';
import { compareWithAllStageView } from './compare-with-all-stage.js';
import { compareWithAllFacet } from './facet.js';
import { compareWithAllDescription } from './description.js';
import { compareWithAllIRs } from './irs.js';

export { compareWithAllAlgorithm } from './algorithm.js';
export type { CompareWithAllData, CompareWithAllPair } from './algorithm.js';
export { compareWithAllScene } from './scene.js';
export type {
  CompareWithAllCaption,
  CompareWithAllScene,
  CompareWithAllStep,
  SceneRow,
} from './scene.js';
export { compareWithAllStageView, formatCount } from './compare-with-all-stage.js';
export { compareWithAllFacet } from './facet.js';
export { compareWithAllDescription } from './description.js';
export { compareWithAllIRs } from './irs.js';

export function registerCompareWithAll(): void {
  // 조각은 reactive 로 돈다 — 마운트하자마자 스스로 시작하고 걸음 간격을 스스로
  // 정한다. 그 선언은 facet.ts 가 아니라 여기다 (S-piece).
  registerAlgorithm<CompareWithAllData>('compareWithAll', compareWithAllAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('compareWithAllScene', compareWithAllScene);
  for (const ir of compareWithAllIRs) registerIR(ir.id, ir);
  registerView('compare-with-all-stage', compareWithAllStageView);
  registerFacets([compareWithAllFacet]);
  registerDescription(compareWithAllFacet.id, compareWithAllDescription);
}

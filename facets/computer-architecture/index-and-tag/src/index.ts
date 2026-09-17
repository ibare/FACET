/**
 * index-and-tag 조각의 등록 진입점.
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

import { indexAndTagAlgorithm, type IndexAndTagData } from './algorithm.js';
import { indexAndTagDescription } from './description.js';
import { indexAndTagFacet } from './facet.js';
import { indexAndTagStageView } from './index-and-tag-stage.js';
import { indexAndTagIRs } from './irs.js';
import { indexAndTagScene } from './scene.js';

export {
  indexAndTagAlgorithm,
  indexAndTagFields,
  type IndexAndTagData,
  type IndexAndTagFields,
} from './algorithm.js';
export { indexAndTagDescription } from './description.js';
export { indexAndTagFacet } from './facet.js';
export { indexAndTagStageView } from './index-and-tag-stage.js';
export { indexAndTagIRs } from './irs.js';
export {
  indexAndTagScene,
  type AddressSplit,
  type IndexAndTagPhase,
  type IndexAndTagScene,
} from './scene.js';

export function registerIndexAndTag(): void {
  registerAlgorithm<IndexAndTagData>('indexAndTag', indexAndTagAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('indexAndTagScene', indexAndTagScene);
  for (const ir of indexAndTagIRs) registerIR(ir.id, ir);
  registerView('index-and-tag-stage', indexAndTagStageView);
  registerFacets([indexAndTagFacet]);
  registerDescription(indexAndTagFacet.id, indexAndTagDescription);
}

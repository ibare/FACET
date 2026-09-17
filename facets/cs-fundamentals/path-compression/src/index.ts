/**
 * path-compression 조각의 등록 진입점.
 *
 * 부수효과로 스스로 등록하지 않는다 — 언제 등록할지는 호스트 앱이 정한다
 * (S-facet).
 *
 * 화면은 장면(Scene) 방식이다. projector 를 두지 않고 `scene.ts` 가 이벤트를 상태로
 * 옮기며, stage 는 `render(next, prev, { animate })` 하나로 산다 (S-scene).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { pathCompressionAlgorithm } from './algorithm.js';
import { pathCompressionScene } from './scene.js';
import { pathCompressionIRs } from './irs.js';
import { pathCompressionFacet } from './facet.js';
import { pathCompressionStageView } from './path-compression-stage.js';

export { pathCompressionAlgorithm } from './algorithm.js';
export type { PathCompressionData } from './algorithm.js';
export { hopsToRoot, pathCompressionScene } from './scene.js';
export type {
  PathCompressionCaption,
  PathCompressionScene,
  PathCompressionStep,
} from './scene.js';
export { pathCompressionIRs } from './irs.js';
export { pathCompressionFacet } from './facet.js';
export { pathCompressionStageView } from './path-compression-stage.js';
export type { PathCompressionStage } from './path-compression-stage.js';

export function registerPathCompression(): void {
  registerAlgorithm('pathCompression', pathCompressionAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('pathCompressionScene', pathCompressionScene);
  for (const ir of pathCompressionIRs) registerIR(ir.id, ir);
  registerView('path-compression-stage', pathCompressionStageView);
  registerFacets([pathCompressionFacet]);
}

/**
 * unknownBecomesKnown 등록 진입점.
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

import { unknownBecomesKnownAlgorithm } from './algorithm.js';
import type { UnknownBecomesKnownData } from './algorithm.js';
import { unknownBecomesKnownDescription } from './description.js';
import { unknownBecomesKnownFacet } from './facet.js';
import { unknownBecomesKnownIRs } from './irs.js';
import { unknownBecomesKnownScene } from './scene.js';
import { unknownBecomesKnownStageView } from './unknown-becomes-known-stage.js';

export { unknownBecomesKnownAlgorithm } from './algorithm.js';
export type { UnknownBecomesKnownData } from './algorithm.js';
export { unknownBecomesKnownDescription } from './description.js';
export { unknownBecomesKnownFacet } from './facet.js';
export { unknownBecomesKnownIRs } from './irs.js';
export { unknownBecomesKnownScene } from './scene.js';
export type {
  ActiveWord,
  ReceivedWord,
  UnknownBecomesKnownScene,
  UnknownCaption,
  WordPhase,
} from './scene.js';
export { unknownBecomesKnownStageView } from './unknown-becomes-known-stage.js';

export function registerUnknownBecomesKnown(): void {
  registerAlgorithm<UnknownBecomesKnownData>('unknownBecomesKnown', unknownBecomesKnownAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('unknownBecomesKnownScene', unknownBecomesKnownScene);
  for (const ir of unknownBecomesKnownIRs) registerIR(ir.id, ir);
  registerView('unknown-becomes-known-stage', unknownBecomesKnownStageView);
  registerFacets([unknownBecomesKnownFacet]);
  registerDescription(unknownBecomesKnownFacet.id, unknownBecomesKnownDescription);
}

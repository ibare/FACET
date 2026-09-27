/**
 * 변환의 합성 — 등록 진입점.
 *
 * 손잡이(순서 · 회전 중심)가 있어 reactive 로 등록한다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { scaleRotateTranslateAlgorithm, type ScaleRotateTranslateData } from './algorithm.js';
import { scaleRotateTranslateProjector } from './projector.js';
import { scaleRotateTranslateIRs } from './irs.js';
import { scaleRotateTranslateStageView } from './scale-rotate-translate-stage.js';
import { scaleRotateTranslateFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './scale-rotate-translate-stage.js';
export * from './facet.js';

export function registerScaleRotateTranslate(): void {
  registerAlgorithm<ScaleRotateTranslateData>('scaleRotateTranslate', scaleRotateTranslateAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('scaleRotateTranslateProjector', scaleRotateTranslateProjector);
  for (const ir of scaleRotateTranslateIRs) registerIR(ir.id, ir);
  registerView('scale-rotate-translate-stage', scaleRotateTranslateStageView);
  registerFacets([scaleRotateTranslateFacet]);
}

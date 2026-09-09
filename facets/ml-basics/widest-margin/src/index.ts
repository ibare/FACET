/**
 * widest-margin 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { widestMarginAlgorithm } from './algorithm.js';
import { widestMarginDescription } from './description.js';
import { widestMarginFacet } from './facet.js';
import { widestMarginIRs } from './irs.js';
import { widestMarginProjector } from './projector.js';
import { widestMarginStageView } from './widest-margin-stage.js';

export { widestMarginAlgorithm, widestBand, widestBandFor } from './algorithm.js';
export type { MarginBand, MarginPoint, WidestMarginData } from './algorithm.js';
export { widestMarginProjector } from './projector.js';
export { widestMarginIRs } from './irs.js';
export { widestMarginFacet } from './facet.js';
export { widestMarginDescription } from './description.js';
export {
  widestMarginStageView,
  readWidestMarginModel,
  formatSlope,
  formatThickness,
} from './widest-margin-stage.js';
export type {
  BandSpec,
  LockSpec,
  MarginPointModel,
  WidestMarginModel,
} from './widest-margin-stage.js';

export function registerWidestMargin(): void {
  registerAlgorithm('widestMargin', widestMarginAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('widestMarginProjector', widestMarginProjector);
  for (const ir of widestMarginIRs) registerIR(ir.id, ir);
  registerView('widest-margin-stage', widestMarginStageView);
  registerFacets([widestMarginFacet]);
  registerDescription(widestMarginFacet.id, widestMarginDescription);
}

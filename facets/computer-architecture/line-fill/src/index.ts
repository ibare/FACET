/**
 * line-fill 등록 진입점.
 *
 * 사이드 이펙트로 스스로를 등록하지 않는다 — 부르는 책임은 호스트 앱에 있다
 * (S-facet).
 *
 * 장면(Scene) 설계의 등록 이름은 algorithm 과 겹치지 않는다. 겹치면
 * `module:<name>` 참조만 보고 어느 쪽인지 말할 수 없게 된다 (C4 ·
 * `register-names` 검사).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { lineFillAlgorithm, lineOf, perLineOf, type LineFillData } from './algorithm.js';
import { lineFillScene } from './scene.js';
import { lineFillIRs } from './irs.js';
import { lineFillStageView } from './line-fill-stage.js';
import { lineFillFacet } from './facet.js';
import { lineFillDescription } from './description.js';

export { lineFillAlgorithm, lineOf, perLineOf, lineFillIRs, lineFillStageView, lineFillFacet, lineFillDescription };
export { lineFillScene } from './scene.js';
export {
  captionOf,
  indicesOfLine,
  lineIn,
  linesIn,
  movingOf,
  perLineIn,
  askingIndex,
  type LineFillScene,
  type LineFillStep,
  type LineFillMoving,
  type LineFillCaption,
} from './scene.js';
export type { LineFillData };

export function registerLineFill(): void {
  registerAlgorithm('lineFill', lineFillAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('lineFillScene', lineFillScene);
  for (const ir of lineFillIRs) registerIR(ir.id, ir);
  registerView('line-fill-stage', lineFillStageView);
  registerFacets([lineFillFacet]);
  registerDescription(lineFillFacet.id, lineFillDescription);
}

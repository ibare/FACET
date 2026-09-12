/**
 * 등록 진입점. 부르는 책임은 호스트 앱에 있다 — 이 파일은 스스로 부르지 않는다.
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { probeAFewCellsAlgorithm } from './algorithm.js';
import { probeAFewCellsProjector } from './projector.js';
import { probeAFewCellsIRs } from './irs.js';
import { probeAFewCellsStageView } from './probe-a-few-cells-stage.js';
import { probeAFewCellsFacet } from './facet.js';
import { probeAFewCellsDescription } from './description.js';

export type { ProbeAFewCellsData } from './algorithm.js';
export {
  probeAFewCellsAlgorithm,
  probeAFewCellsProjector,
  probeAFewCellsIRs,
  probeAFewCellsStageView,
  probeAFewCellsFacet,
  probeAFewCellsDescription,
};

export function registerProbeAFewCells(): void {
  // 조각은 mount 하면 스스로 재생을 시작해야 하고 걸음 간격도 스스로 정한다.
  // 둘 다 reactive 만 준다 (S-piece).
  registerAlgorithm('probeAFewCells', probeAFewCellsAlgorithm, {
    mechanismKind: 'reactive',
  });
  // projector 이름은 algorithm 과 갈라 둔다 — 같으면 `module:` 참조가 어느
  // 쪽인지 말하지 못한다 (C4).
  registerProjector('probeAFewCellsProjector', probeAFewCellsProjector);
  for (const ir of probeAFewCellsIRs) registerIR(ir.id, ir);
  registerView('probe-a-few-cells-stage', probeAFewCellsStageView);
  registerFacets([probeAFewCellsFacet]);
  registerDescription(probeAFewCellsFacet.id, probeAFewCellsDescription);
}

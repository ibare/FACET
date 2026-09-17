/**
 * 등록 진입점. 부르는 책임은 호스트 앱에 있다 — 이 파일은 스스로 부르지 않는다.
 *
 * 화면은 명령이 아니라 **장면**에서 만들어지므로 어느 걸음으로든 곧장 갈 수 있다
 * (S-scene).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { probeAFewCellsAlgorithm } from './algorithm.js';
import { probeAFewCellsIRs } from './irs.js';
import { probeAFewCellsScene } from './scene.js';
import { probeAFewCellsStageView } from './probe-a-few-cells-stage.js';
import { probeAFewCellsFacet } from './facet.js';

export type { ProbeAFewCellsData } from './algorithm.js';
export {
  probeAFewCellsScene,
  type OpenedCell,
  type ProbeAFewCellsScene,
  type ProbePoint,
  type ProbeStep,
} from './scene.js';
export {
  probeAFewCellsAlgorithm,
  probeAFewCellsIRs,
  probeAFewCellsStageView,
  probeAFewCellsFacet,
};

export function registerProbeAFewCells(): void {
  // 조각은 mount 하면 스스로 재생을 시작해야 하고 걸음 간격도 스스로 정한다.
  // 둘 다 reactive 만 준다 (S-piece).
  registerAlgorithm('probeAFewCells', probeAFewCellsAlgorithm, {
    mechanismKind: 'reactive',
  });
  // 장면 이름은 algorithm 과 갈라 둔다 — 같으면 `module:` 참조가 어느 쪽인지
  // 말하지 못한다 (C4).
  registerScenePlan('probeAFewCellsScene', probeAFewCellsScene);
  for (const ir of probeAFewCellsIRs) registerIR(ir.id, ir);
  registerView('probe-a-few-cells-stage', probeAFewCellsStageView);
  registerFacets([probeAFewCellsFacet]);
}

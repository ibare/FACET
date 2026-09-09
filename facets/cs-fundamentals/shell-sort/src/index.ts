/**
 * @ffacet/algorithm-shell-sort — 셸 정렬 완결형 facet 번들.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 담고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다 (S-facet).
 */

export { shellSort, countNeighbourOnly, type ShellSortData } from './algorithm.js';
export { shellSortProjector } from './projector.js';
export { shellSortGapIR, shellSortIRs } from './irs.js';
export { shellSortFacet } from './facet.js';
export { shellSortDescription } from './description.js';
export { shellSortStageView, type ShellSortCellState } from './shell-sort-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { shellSort, type ShellSortData } from './algorithm.js';
import { shellSortProjector } from './projector.js';
import { shellSortIRs } from './irs.js';
import { shellSortStageView } from './shell-sort-stage.js';
import { shellSortFacet } from './facet.js';
import { shellSortDescription } from './description.js';

/** algorithm / projector / IR / view / facet / description 등록 헬퍼. */
export function registerShellSort(): void {
  registerAlgorithm<ShellSortData>('shellSort', shellSort);
  registerProjector('shellSortProjector', shellSortProjector);
  for (const ir of shellSortIRs) registerIR(ir.id, ir);
  registerView('shell-sort-stage', shellSortStageView);
  registerFacets([shellSortFacet]);
  registerDescription(shellSortFacet.id, shellSortDescription);
}

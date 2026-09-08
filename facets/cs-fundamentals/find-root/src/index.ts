/**
 * @ffacet/algorithm-find-root — 뿌리 찾기 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 세 번의 오름을 자동 재생하고 멈추며, 다시 보기와
 * 한 걸음씩 짚어보기 외에는 조작을 받지 않는다.
 */

export { findRootAlgorithm, type FindRootData } from './algorithm.js';
export { findRootProjector } from './projector.js';
export { findRootIRs } from './irs.js';
export { findRootFacet } from './facet.js';
export { findRootDescription } from './description.js';
export { findRootStageView, type FindRootStageData } from './find-root-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { findRootAlgorithm, type FindRootData } from './algorithm.js';
import { findRootProjector } from './projector.js';
import { findRootIRs } from './irs.js';
import { findRootFacet } from './facet.js';
import { findRootDescription } from './description.js';
import { findRootStageView } from './find-root-stage.js';

export function registerFindRoot(): void {
  registerAlgorithm<FindRootData>('findRoot', findRootAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('findRootProjector', findRootProjector);
  for (const ir of findRootIRs) registerIR(ir.id, ir);
  registerView('find-root-stage', findRootStageView);
  registerFacets([findRootFacet]);
  registerDescription(findRootFacet.id, findRootDescription);
}

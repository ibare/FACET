/**
 * @ffacet/algorithm-array-as-tree — 배열 기반 트리 조각(piece) facet 번들.
 *
 * 아홉 걸음을 자동으로 재생하고 멈춘다. 다시 보기와 한 걸음 외에는 조작을
 * 받지 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { arrayAsTreeAlgorithm, type ArrayAsTreeData } from './algorithm.js';
export { arrayAsTreeProjector } from './projector.js';
export { arrayAsTreeIRs } from './irs.js';
export { arrayAsTreeFacet } from './facet.js';
export { arrayAsTreeDescription } from './description.js';
export { arrayAsTreeStageView, type ArrayAsTreeStageInstance } from './array-as-tree-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { arrayAsTreeAlgorithm, type ArrayAsTreeData } from './algorithm.js';
import { arrayAsTreeProjector } from './projector.js';
import { arrayAsTreeIRs } from './irs.js';
import { arrayAsTreeFacet } from './facet.js';
import { arrayAsTreeDescription } from './description.js';
import { arrayAsTreeStageView } from './array-as-tree-stage.js';

export function registerArrayAsTree(): void {
  registerAlgorithm<ArrayAsTreeData>('arrayAsTree', arrayAsTreeAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('arrayAsTreeProjector', arrayAsTreeProjector);
  for (const ir of arrayAsTreeIRs) registerIR(ir.id, ir);
  registerView('array-as-tree-stage', arrayAsTreeStageView);
  registerFacets([arrayAsTreeFacet]);
  registerDescription(arrayAsTreeFacet.id, arrayAsTreeDescription);
}

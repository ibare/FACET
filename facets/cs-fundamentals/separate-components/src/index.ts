/**
 * @ffacet/algorithm-separate-components — 연결 요소 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 자동으로 재생해 할 말을 마치고 멈추며, 다시 보기와
 * 한 걸음씩 외에는 조작을 받지 않는다. 등록 호출은 호스트의 몫이다.
 */

export { separateComponents, type SeparateComponentsData } from './algorithm.js';
export { separateComponentsProjector } from './projector.js';
export { separateComponentsIRs } from './irs.js';
export { separateComponentsFacet } from './facet.js';
export { separateComponentsDescription } from './description.js';
export { separateComponentsStageView } from './separate-components-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { separateComponents, type SeparateComponentsData } from './algorithm.js';
import { separateComponentsProjector } from './projector.js';
import { separateComponentsIRs } from './irs.js';
import { separateComponentsFacet } from './facet.js';
import { separateComponentsDescription } from './description.js';
import { separateComponentsStageView } from './separate-components-stage.js';

export function registerSeparateComponents(): void {
  registerAlgorithm<SeparateComponentsData>('separateComponents', separateComponents, {
    mechanismKind: 'reactive',
  });
  registerProjector('separateComponentsProjector', separateComponentsProjector);
  for (const ir of separateComponentsIRs) registerIR(ir.id, ir);
  registerView('separate-components-stage', separateComponentsStageView);
  registerFacets([separateComponentsFacet]);
  registerDescription(separateComponentsFacet.id, separateComponentsDescription);
}

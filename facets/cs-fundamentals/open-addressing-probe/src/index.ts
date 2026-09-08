/**
 * @ffacet/algorithm-open-addressing-probe — 개방 주소법 조각(piece) facet 번들.
 *
 * 한 주장만 말하는 조각이다. 네 열쇠를 표 안에 앉히는 걸음을 자동으로 재생하고
 * 멈추며, 다시 보기와 한 걸음 두 버튼 외에는 조작을 받지 않는다.
 */

export {
  openAddressingProbe,
  type OpenAddressingProbeData,
  type ProbeKey,
} from './algorithm.js';
export { openAddressingProbeProjector } from './projector.js';
export { openAddressingProbeIRs } from './irs.js';
export { openAddressingProbeFacet } from './facet.js';
export { openAddressingProbeDescription } from './description.js';
export { openAddressingProbeStageView } from './open-addressing-probe-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { openAddressingProbe, type OpenAddressingProbeData } from './algorithm.js';
import { openAddressingProbeProjector } from './projector.js';
import { openAddressingProbeIRs } from './irs.js';
import { openAddressingProbeFacet } from './facet.js';
import { openAddressingProbeDescription } from './description.js';
import { openAddressingProbeStageView } from './open-addressing-probe-stage.js';

export function registerOpenAddressingProbe(): void {
  registerAlgorithm<OpenAddressingProbeData>('openAddressingProbe', openAddressingProbe, {
    mechanismKind: 'reactive',
  });
  registerProjector('openAddressingProbeProjector', openAddressingProbeProjector);
  for (const ir of openAddressingProbeIRs) registerIR(ir.id, ir);
  registerView('open-addressing-probe-stage', openAddressingProbeStageView);
  registerFacets([openAddressingProbeFacet]);
  registerDescription(openAddressingProbeFacet.id, openAddressingProbeDescription);
}

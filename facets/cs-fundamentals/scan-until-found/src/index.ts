/**
 * @ffacet/algorithm-scan-until-found — 순차 탐색 조각(piece) facet 번들.
 *
 * 열네 걸음을 자동으로 재생하고 멈춘다. 다시 보기와 한 걸음 외에는 조작을 받지
 * 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 등록은 호스트 앱의 몫이다 — 이 모듈은 import 만으로 아무것도 등록하지 않는다.
 */

export { scanUntilFound, type ScanUntilFoundData } from './algorithm.js';
export { scanUntilFoundProjector } from './projector.js';
export { scanUntilFoundIRs } from './irs.js';
export { scanUntilFoundFacet } from './facet.js';
export { scanUntilFoundDescription } from './description.js';
export {
  scanUntilFoundStageView,
  type ScanUntilFoundStageInit,
} from './scan-until-found-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { scanUntilFound, type ScanUntilFoundData } from './algorithm.js';
import { scanUntilFoundProjector } from './projector.js';
import { scanUntilFoundIRs } from './irs.js';
import { scanUntilFoundFacet } from './facet.js';
import { scanUntilFoundDescription } from './description.js';
import { scanUntilFoundStageView } from './scan-until-found-stage.js';

export function registerScanUntilFound(): void {
  registerAlgorithm<ScanUntilFoundData>('scanUntilFound', scanUntilFound, {
    mechanismKind: 'reactive',
  });
  registerProjector('scanUntilFoundProjector', scanUntilFoundProjector);
  for (const ir of scanUntilFoundIRs) registerIR(ir.id, ir);
  registerView('scan-until-found-stage', scanUntilFoundStageView);
  registerFacets([scanUntilFoundFacet]);
  registerDescription(scanUntilFoundFacet.id, scanUntilFoundDescription);
}

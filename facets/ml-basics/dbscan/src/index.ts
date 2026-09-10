/**
 * @ffacet/algorithm-dbscan — DBSCAN facet 번들.
 *
 * 조작 반응형 (ReactiveMechanism). 마운트 직후 기본 손잡이로 한 호흡 자동
 * 시연하고 `waitForInput` 으로 들어간다. 컨트롤바는 재생 다섯 + eps 슬라이더 +
 * minPts 슬라이더이고, 코드 패널이 `ir:dbscan` 을 여섯 언어로 편다.
 *
 * algorithm / projector / IR / facet JSON / description / 전용 stage view 를
 * 함께 번들하고 등록 헬퍼를 제공한다. 등록 호출 책임은 호스트 앱에 있다.
 */

export { dbscan, type DbscanData, type DbscanPoint, type DbscanInputEvent } from './algorithm.js';
export { dbscanProjector } from './projector.js';
export { dbscanIR, dbscanIRs } from './irs.js';
export { dbscanFacet } from './facet.js';
export { dbscanDescription } from './description.js';
export { dbscanStageView } from './dbscan-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerView,
  registerFacets,
  registerDescription,
} from '@ffacet/core/runtime';
import { dbscan, type DbscanData } from './algorithm.js';
import { dbscanProjector } from './projector.js';
import { dbscanIRs } from './irs.js';
import { dbscanFacet } from './facet.js';
import { dbscanDescription } from './description.js';
import { dbscanStageView } from './dbscan-stage.js';

export function registerDbscan(): void {
  registerAlgorithm<DbscanData>('dbscan', dbscan, { mechanismKind: 'reactive' });
  registerProjector('dbscanProjector', dbscanProjector);
  for (const ir of dbscanIRs) registerIR(ir.id, ir);
  registerView('dbscan-stage', dbscanStageView);
  registerFacets([dbscanFacet]);
  registerDescription(dbscanFacet.id, dbscanDescription);
}

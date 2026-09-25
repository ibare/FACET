import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { copyVsShareAlgorithm, type CopyVsShareData } from './algorithm.js';
import { copyVsShareProjector } from './projector.js';
import { copyVsShareIRs } from './irs.js';
import { copyVsShareStageView } from './copy-vs-share-stage.js';
import { copyVsShareFacet } from './facet.js';

export {
  copyVsShareAlgorithm,
  COPY_VS_SHARE_DEFAULT_PASS,
  COPY_VS_SHARE_DEFAULT_TIMES,
  type CopyVsShareData,
  type CopyVsSharePassKind,
} from './algorithm.js';
export { copyVsShareProjector } from './projector.js';
export { copyVsShareImperativeIR, copyVsShareIRs } from './irs.js';
export { copyVsShareStageView, type CopyVsShareStage, type CopyVsSharePass } from './copy-vs-share-stage.js';
export { copyVsShareFacet } from './facet.js';

export function registerCopyVsShare(): void {
  // 손잡이가 있으니 reactive — 입력이 알고리즘에 닿는다
  registerAlgorithm<CopyVsShareData>('copyVsShare', copyVsShareAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('copyVsShareProjector', copyVsShareProjector);
  for (const ir of copyVsShareIRs) registerIR(ir.id, ir);
  registerView('copy-vs-share-stage', copyVsShareStageView);
  registerFacets([copyVsShareFacet]);
}

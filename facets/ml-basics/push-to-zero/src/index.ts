import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { pushToZero, type PushToZeroFacetData } from './algorithm';
import { pushToZeroScene } from './scene';
import { pushToZeroStageView } from './push-to-zero-stage';
import { pushToZeroIRs } from './irs';
import { pushToZeroFacet } from './facet';

export {
  pushToZero,
  readPushToZeroData,
  pullWidth,
  countZeros,
  axisSpan,
  l1Update,
  type PushToZeroFacetData,
} from './algorithm';
export { pushToZeroScene, type PushToZeroScene, type PushToZeroStep } from './scene';
export { pushToZeroStageView } from './push-to-zero-stage';
export { pushToZeroIRs } from './irs';
export { pushToZeroFacet } from './facet';

export function registerPushToZero(): void {
  registerAlgorithm<PushToZeroFacetData>('pushToZero', pushToZero, { mechanismKind: 'reactive' });
  registerScenePlan('pushToZeroScene', pushToZeroScene);
  for (const ir of pushToZeroIRs) registerIR(ir.id, ir);
  registerView('push-to-zero-stage', pushToZeroStageView);
  registerFacets([pushToZeroFacet]);
}

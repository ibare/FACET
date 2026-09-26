import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { splitByKey, type SplitByKeyFacetData } from './algorithm';
import { splitByKeyScene } from './scene';
import { splitByKeyStageView } from './split-by-key-stage';
import { splitByKeyIRs } from './irs';
import { splitByKeyFacet } from './facet';

export { splitByKey, checkSplitByKeyData, type SplitByKeyFacetData } from './algorithm';
export { splitByKeyScene, type SplitByKeyScene, type SplitRow, type SplitStep } from './scene';
export { splitByKeyStageView } from './split-by-key-stage';
export { splitByKeyIRs } from './irs';
export { splitByKeyFacet } from './facet';

export function registerSplitByKey(): void {
  registerAlgorithm<SplitByKeyFacetData>('splitByKey', splitByKey, { mechanismKind: 'reactive' });
  registerScenePlan('splitByKeyScene', splitByKeyScene);
  for (const ir of splitByKeyIRs) registerIR(ir.id, ir);
  registerView('split-by-key-stage', splitByKeyStageView);
  registerFacets([splitByKeyFacet]);
}

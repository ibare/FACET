import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { bitwiseCombine, type BitwiseCombineFacetData } from './algorithm.js';
import { bitwiseCombineScene } from './scene.js';
import { bitwiseCombineStageView } from './bitwise-combine-stage.js';
import { bitwiseCombineIRs } from './irs.js';
import { bitwiseCombineFacet } from './facet.js';

export { bitwiseCombine, type BitwiseCombineFacetData, type BitwiseCombineCondition } from './algorithm.js';
export {
  bitwiseCombineScene,
  type BitwiseCombineSceneState,
  type BitwiseCombineStep,
  type BitwiseCombineReadRow,
} from './scene.js';
export { bitwiseCombineStageView } from './bitwise-combine-stage.js';
export { bitwiseCombineIRs } from './irs.js';
export { bitwiseCombineFacet } from './facet.js';

export function registerBitwiseCombine(): void {
  registerAlgorithm<BitwiseCombineFacetData>('bitwiseCombine', bitwiseCombine, { mechanismKind: 'reactive' });
  registerScenePlan('bitwiseCombineScene', bitwiseCombineScene);
  for (const ir of bitwiseCombineIRs) registerIR(ir.id, ir);
  registerView('bitwise-combine-stage', bitwiseCombineStageView);
  registerFacets([bitwiseCombineFacet]);
}

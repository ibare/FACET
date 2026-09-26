import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { keyToValue, type KeyToValueFacetData } from './algorithm.js';
import { keyToValueFacet } from './facet.js';
import { keyToValueIRs } from './irs.js';
import { keyToValueStageView } from './key-to-value-stage.js';
import { keyToValueScene } from './scene.js';

export { keyToValue, type KeyToValueFacetData, type KeyValuePair } from './algorithm.js';
export {
  keyToValueScene,
  readStoreData,
  type KeyToValueScene,
  type KeyToValueStep,
  type OutCard,
  type StorePair,
} from './scene.js';
export { keyToValueStageView } from './key-to-value-stage.js';
export { keyToValueIRs } from './irs.js';
export { keyToValueFacet } from './facet.js';

export function registerKeyToValue(): void {
  registerAlgorithm<KeyToValueFacetData>('keyToValue', keyToValue, { mechanismKind: 'reactive' });
  registerScenePlan('keyToValueScene', keyToValueScene);
  for (const ir of keyToValueIRs) registerIR(ir.id, ir);
  registerView('key-to-value-stage', keyToValueStageView);
  registerFacets([keyToValueFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { secondChance, type SecondChanceFacetData } from './algorithm.js';
import { secondChanceScene } from './scene.js';
import { secondChanceIRs } from './irs.js';
import { secondChanceStageView } from './second-chance-stage.js';
import { secondChanceFacet } from './facet.js';

export { secondChance, readSecondChanceData } from './algorithm.js';
export type { SecondChanceFacetData, SecondChanceSlot } from './algorithm.js';
export { secondChanceScene } from './scene.js';
export type { SecondChanceScene, SecondChanceStep } from './scene.js';
export { secondChanceIRs } from './irs.js';
export { secondChanceStageView } from './second-chance-stage.js';
export { secondChanceFacet } from './facet.js';

export function registerSecondChance(): void {
  registerAlgorithm<SecondChanceFacetData>('secondChance', secondChance, { mechanismKind: 'reactive' });
  registerScenePlan('secondChanceScene', secondChanceScene);
  for (const ir of secondChanceIRs) registerIR(ir.id, ir);
  registerView('second-chance-stage', secondChanceStageView);
  registerFacets([secondChanceFacet]);
}

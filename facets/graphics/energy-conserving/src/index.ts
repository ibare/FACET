import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { energyConserving, type EnergyConservingFacetData } from './algorithm.js';
import { energyConservingScene } from './scene.js';
import { energyConservingStageView } from './energy-conserving-stage.js';
import { energyConservingIRs } from './irs.js';
import { energyConservingFacet } from './facet.js';

export {
  energyConserving,
  narrowEnergyData,
  direction,
  schlick,
  splitAt,
  type EnergyConservingFacetData,
  type EnergySplit,
} from './algorithm.js';
export { energyConservingScene, type EnergyScene, type EnergyBase, type EnergyStep } from './scene.js';
export { energyConservingStageView } from './energy-conserving-stage.js';
export { energyConservingIRs } from './irs.js';
export { energyConservingFacet } from './facet.js';

export function registerEnergyConserving(): void {
  registerAlgorithm<EnergyConservingFacetData>('energyConserving', energyConserving, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('energyConservingScene', energyConservingScene);
  for (const ir of energyConservingIRs) registerIR(ir.id, ir);
  registerView('energy-conserving-stage', energyConservingStageView);
  registerFacets([energyConservingFacet]);
}

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { trainDownValUp, type TrainDownValUpFacetData } from './algorithm.js';
import { trainDownValUpScene } from './scene.js';
import { trainDownValUpIRs } from './irs.js';
import { trainDownValUpStageView } from './train-down-val-up-stage.js';
import { trainDownValUpFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './train-down-val-up-stage.js';
export * from './facet.js';

export function registerTrainDownValUp(): void {
  registerAlgorithm<TrainDownValUpFacetData>('trainDownValUp', trainDownValUp, { mechanismKind: 'reactive' });
  registerScenePlan('trainDownValUpScene', trainDownValUpScene);
  for (const ir of trainDownValUpIRs) registerIR(ir.id, ir);
  registerView('train-down-val-up-stage', trainDownValUpStageView);
  registerFacets([trainDownValUpFacet]);
}

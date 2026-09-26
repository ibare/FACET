import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { editScript, type EditScriptFacetData } from './algorithm';
import { editScriptScene } from './scene';
import { editScriptIRs } from './irs';
import { editScriptStageView } from './edit-script-stage';
import { editScriptFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './irs';
export * from './edit-script-stage';
export * from './facet';

export function registerEditScript(): void {
  registerAlgorithm<EditScriptFacetData>('editScript', editScript, { mechanismKind: 'reactive' });
  registerScenePlan('editScriptScene', editScriptScene);
  for (const ir of editScriptIRs) registerIR(ir.id, ir);
  registerView('edit-script-stage', editScriptStageView);
  registerFacets([editScriptFacet]);
}

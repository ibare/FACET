import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { isolateTheFlood, type IsolateTheFloodFacetData } from './algorithm';
import { isolateTheFloodScene } from './scene';
import { isolateTheFloodStageView } from './isolate-the-flood-stage';
import { isolateTheFloodIRs } from './irs';
import { isolateTheFloodFacet } from './facet';

export { isolateTheFlood, narrowIsolateTheFlood } from './algorithm';
export type { IsolateTheFloodFacetData } from './algorithm';
export { isolateTheFloodScene } from './scene';
export type { IsolateTheFloodScene } from './scene';
export { isolateTheFloodStageView } from './isolate-the-flood-stage';
export { isolateTheFloodIRs } from './irs';
export { isolateTheFloodFacet } from './facet';

export function registerIsolateTheFlood(): void {
  registerAlgorithm<IsolateTheFloodFacetData>('isolateTheFlood', isolateTheFlood, { mechanismKind: 'reactive' });
  registerScenePlan('isolateTheFloodScene', isolateTheFloodScene);
  for (const ir of isolateTheFloodIRs) registerIR(ir.id, ir);
  registerView('isolate-the-flood-stage', isolateTheFloodStageView);
  registerFacets([isolateTheFloodFacet]);
}

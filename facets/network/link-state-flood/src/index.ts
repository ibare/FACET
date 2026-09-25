import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { linkStateFlood, type LinkStateFloodFacetData } from './algorithm.js';
import { linkStateFloodScene } from './scene.js';
import { linkStateFloodIRs } from './irs.js';
import { linkStateFloodStageView } from './link-state-flood-stage.js';
import { linkStateFloodFacet } from './facet.js';

export { linkStateFlood, copyLsa, neighborsOf } from './algorithm.js';
export type { LinkStateFloodFacetData, Lsa, LsaEntry, FloodSend } from './algorithm.js';
export { linkStateFloodScene } from './scene.js';
export type { LinkStateFloodScene, LinkStateFloodStep, SceneLsa, SceneSend } from './scene.js';
export { linkStateFloodIRs } from './irs.js';
export { linkStateFloodStageView } from './link-state-flood-stage.js';
export { linkStateFloodFacet } from './facet.js';

export function registerLinkStateFlood(): void {
  registerAlgorithm<LinkStateFloodFacetData>('linkStateFlood', linkStateFlood, { mechanismKind: 'reactive' });
  registerScenePlan('linkStateFloodScene', linkStateFloodScene);
  for (const ir of linkStateFloodIRs) registerIR(ir.id, ir);
  registerView('link-state-flood-stage', linkStateFloodStageView);
  registerFacets([linkStateFloodFacet]);
}

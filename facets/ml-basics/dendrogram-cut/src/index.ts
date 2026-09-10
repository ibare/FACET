/**
 * dendrogramCut 등록 진입점. 부르는 것은 호스트의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { dendrogramCutAlgorithm } from './algorithm.js';
import { dendrogramCutStageView } from './dendrogram-cut-stage.js';
import { dendrogramCutDescription } from './description.js';
import { dendrogramCutFacet } from './facet.js';
import { dendrogramCutIRs } from './irs.js';
import { dendrogramCutProjector } from './projector.js';

export { dendrogramCutAlgorithm, buildLinkage } from './algorithm.js';
export type {
  DendrogramCutData,
  DendrogramCutPoint,
  DendrogramMerge,
} from './algorithm.js';
export { dendrogramCutProjector } from './projector.js';
export { dendrogramCutStageView, readDendrogramScene } from './dendrogram-cut-stage.js';
export type { DendrogramScene, DendrogramStageBand, DendrogramStageMerge } from './dendrogram-cut-stage.js';
export { dendrogramCutFacet } from './facet.js';
export { dendrogramCutDescription } from './description.js';
export { dendrogramCutIRs } from './irs.js';

export function registerDendrogramCut(): void {
  registerAlgorithm('dendrogramCut', dendrogramCutAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('dendrogramCutProjector', dendrogramCutProjector);
  for (const ir of dendrogramCutIRs) registerIR(ir.id, ir);
  registerView('dendrogram-cut-stage', dendrogramCutStageView);
  registerFacets([dendrogramCutFacet]);
  registerDescription(dendrogramCutFacet.id, dendrogramCutDescription);
}

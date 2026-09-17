/**
 * dendrogramCut 등록 진입점. 부르는 것은 호스트의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { dendrogramCutAlgorithm } from './algorithm.js';
import { dendrogramCutStageView } from './dendrogram-cut-stage.js';
import { dendrogramCutFacet } from './facet.js';
import { dendrogramCutIRs } from './irs.js';
import { dendrogramCutScene } from './scene.js';

export { dendrogramCutAlgorithm, buildLinkage, topHeightOf, wideBandsOf } from './algorithm.js';
export type {
  DendrogramCutData,
  DendrogramCutPoint,
  DendrogramMerge,
} from './algorithm.js';
export { dendrogramCutScene } from './scene.js';
export type {
  DendrogramBand,
  DendrogramCaption,
  DendrogramCutMark,
  DendrogramCutScene,
  DendrogramNode,
  DendrogramStep,
  DendrogramTree,
} from './scene.js';
export { dendrogramCutStageView } from './dendrogram-cut-stage.js';
export { dendrogramCutFacet } from './facet.js';
export { dendrogramCutIRs } from './irs.js';

export function registerDendrogramCut(): void {
  registerAlgorithm('dendrogramCut', dendrogramCutAlgorithm, { mechanismKind: 'reactive' });
  registerScenePlan('dendrogramCutScene', dendrogramCutScene);
  for (const ir of dendrogramCutIRs) registerIR(ir.id, ir);
  registerView('dendrogram-cut-stage', dendrogramCutStageView);
  registerFacets([dendrogramCutFacet]);
}

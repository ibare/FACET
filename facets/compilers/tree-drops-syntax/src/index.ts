import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { treeDropsSyntax, type TreeDropsSyntaxFacetData } from './algorithm.js';
import { treeDropsSyntaxScene } from './scene.js';
import { treeDropsSyntaxStageView } from './tree-drops-syntax-stage.js';
import { treeDropsSyntaxIRs } from './irs.js';
import { treeDropsSyntaxFacet } from './facet.js';

export { treeDropsSyntax, type TreeDropsSyntaxFacetData } from './algorithm.js';
export { treeDropsSyntaxScene, type TreeDropsSyntaxScene } from './scene.js';
export { treeDropsSyntaxStageView } from './tree-drops-syntax-stage.js';
export { treeDropsSyntaxIRs } from './irs.js';
export { treeDropsSyntaxFacet } from './facet.js';

export function registerTreeDropsSyntax(): void {
  registerAlgorithm<TreeDropsSyntaxFacetData>('treeDropsSyntax', treeDropsSyntax, { mechanismKind: 'reactive' });
  registerScenePlan('treeDropsSyntaxScene', treeDropsSyntaxScene);
  for (const ir of treeDropsSyntaxIRs) registerIR(ir.id, ir);
  registerView('tree-drops-syntax-stage', treeDropsSyntaxStageView);
  registerFacets([treeDropsSyntaxFacet]);
}

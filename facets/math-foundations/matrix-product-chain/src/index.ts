import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { matrixProductChain } from './algorithm.js';
import type { MatrixProductChainFacetData } from './algorithm.js';
import { matrixProductChainScene } from './scene.js';
import { matrixProductChainStageView } from './matrix-product-chain-stage.js';
import { matrixProductChainIRs } from './irs.js';
import { matrixProductChainFacet } from './facet.js';

export {
  matrixProductChain,
  narrowData,
  multiply,
  apply,
  formatNumber,
  formatPoint,
  formatPoints,
} from './algorithm.js';
export type { MatrixProductChainFacetData, Pt, Cells, MatrixSpec, Bounds } from './algorithm.js';
export { matrixProductChainScene } from './scene.js';
export type { MatrixProductChainScene } from './scene.js';
export { matrixProductChainStageView } from './matrix-product-chain-stage.js';
export { matrixProductChainIRs } from './irs.js';
export { matrixProductChainFacet } from './facet.js';

export function registerMatrixProductChain(): void {
  registerAlgorithm<MatrixProductChainFacetData>('matrixProductChain', matrixProductChain, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('matrixProductChainScene', matrixProductChainScene);
  for (const ir of matrixProductChainIRs) registerIR(ir.id, ir);
  registerView('matrix-product-chain-stage', matrixProductChainStageView);
  registerFacets([matrixProductChainFacet]);
}

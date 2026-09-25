import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { monadChainInBox, type MonadChainInBoxFacetData } from './algorithm';
import { monadChainInBoxScene } from './scene';
import { monadChainInBoxIRs } from './irs';
import { monadChainInBoxStageView } from './monad-chain-in-box-stage';
import { monadChainInBoxFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './irs';
export * from './monad-chain-in-box-stage';
export * from './facet';

export function registerMonadChainInBox(): void {
  registerAlgorithm<MonadChainInBoxFacetData>('monadChainInBox', monadChainInBox, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('monadChainInBoxScene', monadChainInBoxScene);
  for (const ir of monadChainInBoxIRs) registerIR(ir.id, ir);
  registerView('monad-chain-in-box-stage', monadChainInBoxStageView);
  registerFacets([monadChainInBoxFacet]);
}

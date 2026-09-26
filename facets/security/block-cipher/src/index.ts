import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { blockCipherAlgorithm } from './algorithm.js';
import type { BlockCipherData } from './algorithm.js';
import { blockCipherFacet } from './facet.js';
import { blockCipherIRs } from './irs.js';
import { blockCipherProjector } from './projector.js';
import { blockCipherStageView } from './block-cipher-stage.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './block-cipher-stage.js';
export * from './facet.js';

export function registerBlockCipher(): void {
  registerAlgorithm<BlockCipherData>('blockCipher', blockCipherAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('blockCipherProjector', blockCipherProjector);
  for (const ir of blockCipherIRs) registerIR(ir.id, ir);
  registerView('block-cipher-stage', blockCipherStageView);
  registerFacets([blockCipherFacet]);
}

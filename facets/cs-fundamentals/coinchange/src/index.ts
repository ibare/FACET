export { coinchange, type CoinChangeData } from './algorithm.js';
export { coinchangeProjector } from './projector.js';
export { coinchangeImperativeIR, coinchangeIRs } from './irs.js';
export { coinchangeFacet } from './facet.js';
export { coinchangeDescription } from './description.js';

import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
  registerIR,
  registerDescription,
} from '@facet/core/runtime';
import { coinchange, type CoinChangeData } from './algorithm.js';
import { coinchangeProjector } from './projector.js';
import { coinchangeIRs } from './irs.js';
import { coinchangeFacet } from './facet.js';
import { coinchangeDescription } from './description.js';

export function registerCoinchange(): void {
  registerAlgorithm<CoinChangeData>('coinchange', async (ctx) => {
    await coinchange(ctx);
  });
  registerProjector('coinchangeProjector', coinchangeProjector);
  for (const ir of coinchangeIRs) registerIR(ir.id, ir);
  registerFacets([coinchangeFacet]);
  registerDescription(coinchangeFacet.id, coinchangeDescription);
}

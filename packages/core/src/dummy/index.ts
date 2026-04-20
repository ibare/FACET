/**
 * 더미 facet 모음 + 등록 helper.
 */

export { counter } from './algorithms/counter.js';
export type { CounterData } from './algorithms/counter.js';
export { counterProjector } from './projectors/counterProjector.js';
export { counterFacet } from './facets/counter.js';

import { counter } from './algorithms/counter.js';
import { counterProjector } from './projectors/counterProjector.js';
import { counterFacet } from './facets/counter.js';
import {
  registerAlgorithm,
  registerProjector,
  registerFacets,
} from '../runtime/registry.js';

export function registerDummyFacets(): void {
  registerAlgorithm('counter', counter);
  registerProjector('counterProjector', counterProjector);
  registerFacets([counterFacet]);
}

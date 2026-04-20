/**
 * 최소 예제 facet (counter) — 러너/View Catalog 통합 검증용.
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

export function registerCounterExample(): void {
  registerAlgorithm('counter', counter);
  registerProjector('counterProjector', counterProjector);
  registerFacets([counterFacet]);
}

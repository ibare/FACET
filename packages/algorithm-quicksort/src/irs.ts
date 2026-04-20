/**
 * QuickSort IR — 패러다임 메타. 실제 코드는 transpiler 가 생성.
 */

import type { IR } from '@facet/core';

export const quicksortIRs: IR[] = [
  { id: 'quicksort-imperative', algorithm: 'quicksort', paradigm: 'imperative' },
  { id: 'quicksort-functional', algorithm: 'quicksort', paradigm: 'functional' },
];

/**
 * BubbleSort IR — 패러다임 메타. 실 코드는 transpiler 가 생성.
 */

import type { IR } from '@facet/core';

export const bubblesortIRs: IR[] = [
  { id: 'bubblesort-imperative', algorithm: 'bubblesort', paradigm: 'imperative' },
  { id: 'bubblesort-functional', algorithm: 'bubblesort', paradigm: 'functional' },
];

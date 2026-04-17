import type { Algorithm, IR } from '@facet/core';

export const bubbleSortAlgorithm: Algorithm = {
  id: 'bubbleSort',
  description: '인접한 두 원소를 비교해 큰 것을 뒤로 보내는 정렬 알고리즘',
  phases: ['outer_loop', 'comparing', 'swapping', 'pass_complete'],
  category: 'sorting',
  complexity: { time: 'O(n²)', space: 'O(1)' },
};

export const bubbleSortIRs: IR[] = [
  { id: 'bubbleSort-imperative', algorithm: 'bubbleSort', paradigm: 'imperative' },
  { id: 'bubbleSort-functional', algorithm: 'bubbleSort', paradigm: 'functional' },
];

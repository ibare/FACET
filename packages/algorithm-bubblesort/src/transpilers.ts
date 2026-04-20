/**
 * BubbleSort transpiler — 패러다임 × 언어 조합.
 *
 * phase 어휘: compare | swap | pass-end (Projector 가 동일 어휘로 highlightPhase)
 */

import type { Transpiler } from '@facet/core';

export const bubblesortPythonImperative: Transpiler = {
  id: 'bubblesort-python-imperative',
  paradigm: 'imperative',
  target: 'python',
  targetLabel: 'Python',
  transpile() {
    return {
      lines: [
        { code: 'def bubblesort(arr):', phase: null },
        { code: '    n = len(arr)', phase: null },
        { code: '    for p in range(n - 1):', phase: null },
        { code: '        swapped = False', phase: null },
        { code: '        for j in range(n - 1 - p):', phase: null },
        { code: '            if arr[j] > arr[j+1]:', phase: 'compare' },
        { code: '                arr[j], arr[j+1] = arr[j+1], arr[j]', phase: 'swap' },
        { code: '                swapped = True', phase: null },
        { code: '        if not swapped: break', phase: 'pass-end' },
      ],
    };
  },
};

export const bubblesortJavascriptImperative: Transpiler = {
  id: 'bubblesort-javascript-imperative',
  paradigm: 'imperative',
  target: 'javascript',
  targetLabel: 'JavaScript',
  transpile() {
    return {
      lines: [
        { code: 'function bubblesort(arr) {', phase: null },
        { code: '  const n = arr.length;', phase: null },
        { code: '  for (let p = 0; p < n - 1; p++) {', phase: null },
        { code: '    let swapped = false;', phase: null },
        { code: '    for (let j = 0; j < n - 1 - p; j++) {', phase: null },
        { code: '      if (arr[j] > arr[j+1]) {', phase: 'compare' },
        { code: '        [arr[j], arr[j+1]] = [arr[j+1], arr[j]];', phase: 'swap' },
        { code: '        swapped = true;', phase: null },
        { code: '      }', phase: null },
        { code: '    }', phase: null },
        { code: '    if (!swapped) break;', phase: 'pass-end' },
        { code: '  }', phase: null },
        { code: '}', phase: null },
      ],
    };
  },
};

export const bubblesortTranspilers = [
  bubblesortPythonImperative,
  bubblesortJavascriptImperative,
];

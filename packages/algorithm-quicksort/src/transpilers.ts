/**
 * QuickSort 전용 transpiler — 패러다임 × 언어 조합으로 코드 + phase 라벨 산출.
 *
 * phase 어휘: pivot-select | compare | swap | partition | recurse
 * Projector 가 알고리즘 'phase' 이벤트로 동일 어휘를 highlightPhase 로 보냄.
 */

import type { Transpiler } from '@facet/core';

export const quicksortPythonImperative: Transpiler = {
  id: 'quicksort-python-imperative',
  paradigm: 'imperative',
  target: 'python',
  targetLabel: 'Python',
  transpile() {
    return {
      lines: [
        { code: 'def quicksort(arr, lo, hi):', phase: null },
        { code: '    if lo >= hi: return', phase: null },
        { code: '    pivot = arr[hi]', phase: 'pivot-select' },
        { code: '    i = lo - 1', phase: null },
        { code: '    for j in range(lo, hi):', phase: null },
        { code: '        if arr[j] < pivot:', phase: 'compare' },
        { code: '            i += 1', phase: null },
        { code: '            arr[i], arr[j] = arr[j], arr[i]', phase: 'swap' },
        { code: '    arr[i+1], arr[hi] = arr[hi], arr[i+1]', phase: 'partition' },
        { code: '    quicksort(arr, lo, i)', phase: 'recurse' },
        { code: '    quicksort(arr, i+2, hi)', phase: 'recurse' },
      ],
    };
  },
};

export const quicksortPythonFunctional: Transpiler = {
  id: 'quicksort-python-functional',
  paradigm: 'functional',
  target: 'python',
  targetLabel: 'Python',
  transpile() {
    return {
      lines: [
        { code: 'def quicksort(xs):', phase: null },
        { code: '    if len(xs) <= 1: return xs', phase: null },
        { code: '    pivot = xs[-1]', phase: 'pivot-select' },
        { code: '    rest = xs[:-1]', phase: null },
        { code: '    smaller = [x for x in rest if x < pivot]', phase: 'compare' },
        { code: '    larger  = [x for x in rest if x >= pivot]', phase: 'compare' },
        { code: '    return (', phase: 'partition' },
        { code: '        quicksort(smaller)', phase: 'recurse' },
        { code: '        + [pivot]', phase: null },
        { code: '        + quicksort(larger)', phase: 'recurse' },
        { code: '    )', phase: null },
      ],
    };
  },
};

export const quicksortJavascriptImperative: Transpiler = {
  id: 'quicksort-javascript-imperative',
  paradigm: 'imperative',
  target: 'javascript',
  targetLabel: 'JavaScript',
  transpile() {
    return {
      lines: [
        { code: 'function quicksort(arr, lo, hi) {', phase: null },
        { code: '  if (lo >= hi) return;', phase: null },
        { code: '  const pivot = arr[hi];', phase: 'pivot-select' },
        { code: '  let i = lo - 1;', phase: null },
        { code: '  for (let j = lo; j < hi; j++) {', phase: null },
        { code: '    if (arr[j] < pivot) {', phase: 'compare' },
        { code: '      i++;', phase: null },
        { code: '      [arr[i], arr[j]] = [arr[j], arr[i]];', phase: 'swap' },
        { code: '    }', phase: null },
        { code: '  }', phase: null },
        { code: '  [arr[i+1], arr[hi]] = [arr[hi], arr[i+1]];', phase: 'partition' },
        { code: '  quicksort(arr, lo, i);', phase: 'recurse' },
        { code: '  quicksort(arr, i+2, hi);', phase: 'recurse' },
        { code: '}', phase: null },
      ],
    };
  },
};

export const quicksortTranspilers = [
  quicksortPythonImperative,
  quicksortPythonFunctional,
  quicksortJavascriptImperative,
];

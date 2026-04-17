import type { Transpiler } from '@facet/core';

export const pythonImperative: Transpiler = {
  id: 'python-imperative',
  paradigm: 'imperative',
  target: 'python',
  targetLabel: 'Python',
  transpile() {
    return {
      lines: [
        { code: 'def bubble_sort(arr):', phase: null },
        { code: '    n = len(arr)', phase: null },
        { code: '    for i in range(n):', phase: 'outer_loop' },
        { code: '        for j in range(n - i - 1):', phase: null },
        { code: '            if arr[j] > arr[j + 1]:', phase: 'comparing' },
        { code: '                arr[j], arr[j+1] = arr[j+1], arr[j]', phase: 'swapping' },
        { code: '    return arr', phase: 'pass_complete' },
      ],
    };
  },
};

export const pythonFunctional: Transpiler = {
  id: 'python-functional',
  paradigm: 'functional',
  target: 'python',
  targetLabel: 'Python',
  transpile() {
    return {
      lines: [
        { code: 'def bubble_pass(xs):', phase: 'outer_loop' },
        { code: '    if len(xs) < 2: return xs', phase: null },
        { code: '    if xs[0] > xs[1]:', phase: 'comparing' },
        { code: '        return [xs[1]] + bubble_pass([xs[0]] + xs[2:])', phase: 'swapping' },
        { code: '    return [xs[0]] + bubble_pass(xs[1:])', phase: null },
        { code: '', phase: null },
        { code: 'def bubble_sort(xs):', phase: null },
        { code: '    if len(xs) < 2: return xs', phase: null },
        { code: '    passed = bubble_pass(xs)', phase: null },
        { code: '    return bubble_sort(passed[:-1]) + [passed[-1]]', phase: 'pass_complete' },
      ],
    };
  },
};

export const javascriptImperative: Transpiler = {
  id: 'javascript-imperative',
  paradigm: 'imperative',
  target: 'javascript',
  targetLabel: 'JavaScript',
  transpile() {
    return {
      lines: [
        { code: 'function bubbleSort(arr) {', phase: null },
        { code: '  const n = arr.length;', phase: null },
        { code: '  for (let i = 0; i < n; i++) {', phase: 'outer_loop' },
        { code: '    for (let j = 0; j < n - i - 1; j++) {', phase: null },
        { code: '      if (arr[j] > arr[j + 1]) {', phase: 'comparing' },
        { code: '        [arr[j], arr[j+1]] = [arr[j+1], arr[j]];', phase: 'swapping' },
        { code: '      }', phase: null },
        { code: '    }', phase: null },
        { code: '  }', phase: null },
        { code: '  return arr;', phase: 'pass_complete' },
        { code: '}', phase: null },
      ],
    };
  },
};

export const javascriptFunctional: Transpiler = {
  id: 'javascript-functional',
  paradigm: 'functional',
  target: 'javascript',
  targetLabel: 'JavaScript',
  transpile() {
    return {
      lines: [
        { code: 'const bubblePass = (xs) => {', phase: 'outer_loop' },
        { code: '  if (xs.length < 2) return xs;', phase: null },
        { code: '  return xs[0] > xs[1]', phase: 'comparing' },
        { code: '    ? [xs[1], ...bubblePass([xs[0], ...xs.slice(2)])]', phase: 'swapping' },
        { code: '    : [xs[0], ...bubblePass(xs.slice(1))];', phase: null },
        { code: '};', phase: null },
        { code: '', phase: null },
        { code: 'const bubbleSort = (xs) => {', phase: null },
        { code: '  if (xs.length < 2) return xs;', phase: null },
        { code: '  const passed = bubblePass(xs);', phase: null },
        { code: '  return [...bubbleSort(passed.slice(0,-1)), passed.at(-1)];', phase: 'pass_complete' },
      ],
    };
  },
};

export const mainstreamTranspilers = [
  pythonImperative,
  pythonFunctional,
  javascriptImperative,
  javascriptFunctional,
];

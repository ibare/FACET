/**
 * Transpiler 출력 스냅샷 — 2 IR × 6 언어 = 12 스냅샷.
 *
 * 코드/phase 출력의 의도치 않은 변경을 잡는다. 스냅샷이 의도적으로 바뀌면
 * `pnpm test -u` 로 갱신.
 */

import { describe, expect, it } from 'vitest';
import { bubblesortImperativeIR } from '@facet/algorithm-bubblesort';
import { quicksortImperativeIR } from '@facet/algorithm-quicksort';
import { pythonTranspiler } from '@facet/transpiler-python';
import { javascriptTranspiler } from '@facet/transpiler-javascript';
import { typescriptTranspiler } from '@facet/transpiler-typescript';
import { javaTranspiler } from '@facet/transpiler-java';
import { cppTranspiler } from '@facet/transpiler-cpp';
import { csharpTranspiler } from '@facet/transpiler-csharp';
import type { IR, Transpiler } from '@facet/core';

const IRS: { name: string; ir: IR }[] = [
  { name: 'bubblesort', ir: bubblesortImperativeIR },
  { name: 'quicksort', ir: quicksortImperativeIR },
];

const TRANSPILERS: Transpiler[] = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

describe('Transpiler 스냅샷', () => {
  for (const { name, ir } of IRS) {
    for (const t of TRANSPILERS) {
      it(`${name} → ${t.language}`, () => {
        const { lines } = t.transpile(ir);
        const formatted = lines
          .map((l) => `${(l.phase ?? '·').padEnd(14)} | ${l.code}`)
          .join('\n');
        expect(formatted).toMatchSnapshot();
      });
    }
  }
});

/**
 * Transpiler 출력 스냅샷 — 1 IR × 6 언어 = 6 스냅샷.
 *
 * 코드/phase 출력의 의도치 않은 변경을 잡는다. 스냅샷이 의도적으로 바뀌면
 * `pnpm test -u` 로 갱신.
 */

import { describe, expect, it } from 'vitest';
import { bubblesortImperativeIR } from '@ffacet/algorithm-bubble-sort';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import type { IR, Transpiler } from '@ffacet/core';

const IRS: { name: string; ir: IR }[] = [
  { name: 'bubblesort', ir: bubblesortImperativeIR },
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

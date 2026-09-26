/**
 * assignOnce 개념 선언.
 *
 * canonical facet 은 `facet:assignOnce` — 곧은 줄 다섯(`x = 4` · `y = x + 1` · `x = y * 2` · `x = x - y` · `return x`)을 한 줄씩
 * SSA 로 바꾼다. 읽는 자리를 먼저 살아 있는 판으로, 그다음 넣는 자리에 새 판을 준다 — 줄 4 는 `x3 = x2 - y1`.
 * 넣기가 셋이던 `x` 가 판 셋(`x1` · `x2` · `x3`)으로 갈라진다. 6 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * `ssaForm`(완제품)은 컴파일 때 정해지는 파이의 수와 돌릴 때의 고르기를 가르고, `phiMerges` 는 갈래가 만나는 자리를 쥔다.
 * 이쪽은 **갈래 없는 곧은 줄에서의 이름 바꾸기** — 넣을 때마다 새 판, 읽기가 넣기보다 먼저 — 만 쥔다. 그래서 definition 은
 * straight-line · fresh numbered version · read before write 를 쥐고, φ · merge · branch · run time 을 쓰지 않는다.
 *
 * 전제: `@notation native` — 세 주소 코드 · 판 번호는 교과서 표기. 인자처럼 읽기만 하는 이름과 임시는 판을 붙이지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const assignOnceConcept: FacetConceptSource = {
  id: 'assignOnce',
  label: 'Renaming Each Assignment to a New Version',
  canonicalFacet: 'facet:assignOnce',

  surface: {
    definition:
      'Converting straight-line code to single assignment gives every write to a variable a fresh numbered version and rewrites each read to the version live on that line, renaming the reads before the write.',
    exemplarKeywords: [
      'SSA renaming',
      'variable versioning',
      'subscripted names x1 x2 x3',
      'each variable assigned exactly once',
      'reassignment in SSA',
      'single assignment rule',
      'x = x - y in SSA',
      'rename variables compiler pass',
      'value numbering names',
    ],
  },

  briefing: {
    observable: [
      'Five lines of three-address code, the same five as the source because each line holds one operation: `x = 4`, `y = x + 1`, `x = y * 2`, `x = x - y`, `return x`. A side panel lists each name with dots for the lines that assign it — `x` three (lines 1, 3, 4), `y` one.',
      'One line is rewritten per step, six steps including step 0. On each line the reads are renamed first to the version currently alive, then the written name gets that name\'s next number, counted from 1 per name.',
      'Line 1 becomes `x1 = 4`; line 2 `y1 = x1 + 1`; line 3 `x2 = y1 * 2`.',
      'Line 4 is where the order matters: the `x` on the right is the value before this line, so it becomes `x2`, and the left side becomes the new `x3` — `x3 = x2 - y1`. Line 5 has no write; its read becomes `return x3`.',
      'At each rewrite a dot drops from the name down to its version. At the end `x` has no dots left and the four versions `x1`, `y1`, `x2`, `x3` hold one each — three writes of `x` have become three versions written once.',
      'The code has no branches, so at every line exactly one version is alive. The notation is textbook three-address code with version subscripts.',
    ],

    screen: {
      affordances: [
        'The screen plays the rewrite by itself, one line per step, and stops at `return x3`.',
        'A Replay button and a playback strip sit below it. Holding the strip on line 4 shows the read renamed to `x2` before the write becomes `x3`.',
        'The code is fixed, so each rewritten line and the before-and-after assignment counts can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article first introduces SSA and needs the basic renaming on code with no branches, before any φ appears.',
      'A reader is confused by a line like `x = x - y` in single-assignment form, and the article needs to show why the right-hand `x` takes the old version and the left-hand one a new version.',
    ],

    avoidWhen: [
      'The article is about merging values from two branches. There are no branches here.',
      'The subject is immutable variables or `const` in a source language. The renaming here is a compiler transformation of ordinary reassignments.',
      'The article is about register allocation or reusing storage. Versions here are names, not locations.',
    ],

    contrastWith: [
      {
        concept: 'phiMerges',
        note: 'On straight-line code one version is always alive, so renaming is enough. Where branches rejoin with different versions, renaming alone cannot choose and a φ is needed.',
      },
      {
        concept: 'ssaForm',
        note: 'Renaming every write is one half of building SSA. The other half is placing φ functions at merges, which only branching code requires.',
      },
      {
        concept: 'valueFlowsToUse',
        note: 'A def-use chain connects a write to its reads while keeping the name; versioning puts the same connection into the name itself, so each read names its one source.',
      },
    ],
  },
};

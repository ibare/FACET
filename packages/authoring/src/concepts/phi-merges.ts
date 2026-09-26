/**
 * phiMerges 개념 선언.
 *
 * canonical facet 은 `facet:phiMerges` — 함수 `f(a)` 의 세 주소 코드 네 블록에서 B1~B3 은 판이 매겨진 채 시작한다. 만나는 블록 B4
 * 머리에서 이름마다 두 갈래 끝의 판이 흘러들어 견주어진다 — `x` 다름 → `x3 = φ(B2: x2, B3: x1)`, `y` 다름 → `y3 = φ(B2: y1, B3: y2)`,
 * `z` 같음 → 파이 없음. B4 몸의 읽기가 바뀐 뒤, `a = 8` 로 한 번 돌려 B2 에서 들어오고 파이가 B2 쪽을 골라 20 을 돌려준다. 6 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * `ssaForm`(완제품)은 두 손잡이로 컴파일 때와 돌릴 때를 가른다. `assignOnce` 는 갈래 없는 이름 바꾸기다. 이쪽은 **만나는 자리 하나** —
 * 두 판이 다르면 파이가 서고, 돌릴 때 들어온 간선 쪽 인자를 집는다 — 를 쥔다. 그래서 definition 은 join block · predecessor ·
 * one argument per incoming edge · arrived from 을 쥐고, fresh version per write 나 how many φ(수의 대비)를 쓰지 않는다.
 *
 * 전제: `@notation native` 교과서 표기. a = 8 은 예로 정한 값(a = 3 이면 B3 으로 가 11). 되돌아오는 간선은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const phiMergesConcept: FacetConceptSource = {
  id: 'phiMerges',
  label: 'φ Functions Where Branches Merge',
  canonicalFacet: 'facet:phiMerges',

  surface: {
    definition:
      'Where two branches leave different versions of one variable, the join block\'s head gets a φ function with one argument per incoming edge; executing it takes the argument of the predecessor control arrived from.',
    exemplarKeywords: [
      'phi function',
      'phi node',
      'φ node in LLVM',
      'merge point after if-else',
      'join block',
      'predecessor block',
      'which value after the branch',
      'control flow merge',
      'SSA phi instruction',
      'selecting by incoming edge',
    ],
  },

  briefing: {
    observable: [
      'Three-address code in four blocks: B1 on top (`x1 = a`, `y1 = 1`, `z1 = a * 2`, `t1 = x1 > 5`, `ifnot t1 goto L1`), the branches B2 (`x2 = x1 - 5`, `goto L2`) and B3 (`L1: y2 = 2`) in the middle, and the merge block B4 below, still reading `x`, `y`, `z` with no versions.',
      'Step 1, `x`: B2 ends with `x2`, B3 ends with `x1`. The two versions flow along the edges into B4\'s head, differ, and merge into `x3 = φ(B2: x2, B3: x1)`. B3 never wrote `x`, yet a φ still stands. The label `L2` moves onto this first φ line.',
      'Step 2, `y`: this time B2\'s side is the untouched `y1` and B3\'s is the new `y2`, so `y3 = φ(B2: y1, B3: y2)`. Step 3, `z`: both sides are `z1`, so no φ is placed and `z1` passes through.',
      'Step 4: B4\'s reads switch to the merged versions — `t2 = x3 + y3` and `t3 = t2 + z1`, three reads rewritten.',
      'Step 5 runs once with `a = 8`: `x1 > 5` is true, so B1 falls through to B2, whose `goto L2` reaches B4. Coming from B2, both φ take the B2 side — `x3 = x2` (3) and `y3 = y1` (1) — `z1` is 16, and 20 is returned. Six steps including step 0.',
      'Temporaries `t1`–`t3` and the parameter `a` take no version. The notation is textbook SSA with the block written beside each argument; `a = 8` is an example value, and there are no back edges.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one merged name per step and then one run, and stops when 20 is returned.',
        'A Replay button and a playback strip sit below it. Holding the strip on step 3 shows `z` passing through with no φ beside the two that were placed.',
        'The program and the input are fixed, so every φ line and the returned 20 can be quoted as they appear.',
      ],
    },

    useWhen: [
      'The article reaches the point in SSA where an if and an else assign differently and has to explain what a read after the join refers to.',
      'A reader assumes a φ is needed only for a variable both branches assign, and the article needs `x`, written on one side only, still getting a φ while `z` gets none.',
    ],

    avoidWhen: [
      'The article is about renaming straight-line code. The first three blocks arrive already versioned.',
      'The subject is φ functions at loop headers. This code has no loop.',
      'The article wants to compare several inputs or branch shapes. One program runs once with one input.',
    ],

    contrastWith: [
      {
        concept: 'assignOnce',
        note: 'Straight-line renaming never faces two live versions at once; a φ exists only because branches rejoin carrying different ones.',
      },
      {
        concept: 'ssaForm',
        note: 'Placing and evaluating one φ is the mechanism. The complete form adds that branch contents fix the number of φ at compile time while inputs only change the selection.',
      },
      {
        concept: 'conditionalStatement',
        note: 'A conditional decides which side runs; the φ is how a compiler\'s intermediate code records, after the fact, which side\'s value to use.',
      },
    ],
  },
};

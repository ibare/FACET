/**
 * ssaForm 개념 선언.
 *
 * canonical facet 은 `facet:ssaForm` — 함수 `f(a)` 를 낮춘 세 주소 코드(블록은 이미 나뉨)에 판을 매기고, 만나는 블록 머리에서
 * 두 앞선 블록 끝의 판이 다를 때만 파이를 세운 뒤, 인자 `a` 로 한 번 돌린다. 손잡이 둘 — "갈래가 넣는 이름"(`x | —` · `x | y` ·
 * `x | x` · `x y | y`)은 파이의 수(1 · 2 · 1 · 2)를 바꾸고, "인자 a"(3 · 8)는 다시 컴파일하지 않고 파이가 고르는 쪽과 돌려준 값만 바꾼다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `assignOnce` 는 곧은 줄에서 넣을 때마다 새 판이 되는 것을, `phiMerges` 는 한 프로그램의 만나는 자리에서 파이가 서고 고르는 것을
 * 쥔다. 이쪽은 **컴파일 때 정해지는 것(판 · 파이의 수)과 돌릴 때 정해지는 것(어느 인자를 고르나)을 두 손잡이로 가르는** 대비를
 * 맡는다. 그래서 definition 은 compile time · run time · how many φ · input changes only the selection 을 쥐고,
 * rename each write(판 매기기 걸음)와 predecessor edge(고르기 자체)를 쓰지 않는다.
 *
 * 전제 (설명 글 `ssaForm.md` 가 밝힌 것):
 *  - `@notation native` — 세 주소 코드 · SSA 는 교과서 표기(`x3 = φ(B2: x2, B3: x1)`), 특정 컴파일러의 문법이 아니다.
 *  - a = 8 · 3 은 예로 정한 값. SSA 는 LLVM · GCC 의 중간 표현이다. 고리 있는 코드는 다루지 않는다.
 *  - 코드 패널은 컴파일러 쪽 셈(`numberVersions` · `placePhis`)만 여섯 언어로 보인다. 돌림은 코드 패널에 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ssaFormConcept: FacetConceptSource = {
  id: 'ssaForm',
  label: 'SSA Form: What Is Fixed at Compile Time and What at Run Time',
  canonicalFacet: 'facet:ssaForm',

  surface: {
    definition:
      'In static single assignment form, which variables each branch assigns decides at compile time how many φ functions are placed, while a different input only changes at run time which version each φ selects.',
    exemplarKeywords: [
      'static single assignment',
      'SSA form',
      'SSA construction',
      'phi placement',
      'LLVM IR',
      'GCC GIMPLE SSA',
      'compiler intermediate representation',
      'versioned variables',
      'compile time vs run time',
      'if-else in SSA',
      'why SSA makes optimization easier',
    ],
  },

  briefing: {
    observable: [
      'A function `f(a)` is shown as three-address code already cut into blocks: B1 sets `x`, `y`, `z` and tests `x > 5`, one or two branch blocks assign names, and a merge block computes `x + y + z` and returns it.',
      'Compile steps come first. Each block that is not the merge gets one step: reads take the current version, and every write gets a new one (`x1`, `x2`). At the merge head there is one step per name — `x`, `y`, `z` — where the two predecessor end versions flow in along the edges and are compared; if they differ a φ rises, if they match the version passes through. Then the merge body\'s reads take the new versions.',
      'Run steps follow: with the chosen `a`, the path goes through one branch into the merge, the φ picks the argument from the side it came in by, and the function returns a value. With `x | y` and `a = 8` the round is 10 steps including step 0.',
      'Names set per branch changes the φ count: `x | —` gives 3 blocks and 1 φ (`x3 = φ(B1: x1, B2: x2)`, one argument straight from B1); `x | y` gives 2 (`x3 = φ(B2: x2, B3: x1)`, `y3 = φ(B2: y1, B3: y2)`); `x | x` gives 1 (`x4 = φ(B2: x2, B3: x3)`) — one φ per name, not per write; `x y | y` gives 2.',
      '`z` is assigned in neither branch, so both ends are `z1` and it passes through with no φ. Temporaries `t1`, `t2`, `t3` and the parameter `a` take no version; the `1` in `t1` is not a version number.',
      'Changing only Argument a recompiles nothing: versions and φ lines stay put, and only the two run steps replay (3 steps with step 0). The path moves between going through the then block and skipping it, the φ\'s choice moves to the other argument, and the returned value changes — for `x | y`, 20 with `a = 8` and 11 with `a = 3`.',
      'The notation is textbook three-address code and SSA, not any one compiler\'s syntax. The values 3 and 8 are examples, and code with loops is not covered. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Names set per branch" with four positions (`x | —`, `x | y` as the starting position, `x | x`, `x y | y`) and "Argument a" with two (3, and 8 as the starting position). Three readouts: "φ functions", "Versioned names" and "Returned value".',
        'The move that makes the idea land is using the handles one at a time: stepping the branch handle makes φ lines rise or sink at the merge head, while flipping `a` leaves every φ where it is and only moves which argument is picked and the returned value.',
        'The code panel, labelled "Numbering versions", starts empty with a "+ Add language" button. It shows only the compiler side — `numberVersions` and `placePhis` — so its highlight goes dark during the run steps, and its result does not change when only `a` changes. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article introduces SSA as the intermediate form used by LLVM or GCC and needs to separate what the compiler decides once from what the running program decides each time.',
      'A reader thinks φ functions are placed according to which path the program takes, and the article needs an input change that moves the selection while leaving every φ in place.',
    ],

    avoidWhen: [
      'The subject is SSA for loops, where a φ argument comes from a block not yet numbered. The code here has no back edge.',
      'The article is about how basic blocks and edges are found. The blocks are given already cut.',
      'The article is about leaving SSA, register allocation, or turning φ into copies. None of that is performed here.',
    ],

    contrastWith: [
      {
        concept: 'assignOnce',
        note: 'Giving every write its own version is the renaming half of SSA and needs no branches. Branches are what add the second half, deciding where merges need φ functions.',
      },
      {
        concept: 'phiMerges',
        note: 'A φ standing where two different versions meet and taking the incoming side is the mechanism; the whole form adds that the number of φ is a compile-time fact while the choice is a run-time one.',
      },
      {
        concept: 'flowGraphs',
        note: 'A flow graph finds that one read can be reached by two definitions. SSA resolves exactly that by giving the read a single name defined by a φ.',
      },
      {
        concept: 'foldAndSweep',
        note: 'Constant folding and dead-code removal are optimizations that become simpler on single-assignment code, because every use has exactly one definition to inspect.',
      },
    ],
  },
};

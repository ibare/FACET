/**
 * scopeAndSymbols 개념 선언.
 *
 * canonical facet 은 `facet:scopeAndSymbols` — 같은 열 줄(`size` · `i` · `fill(n)` · `last`)을 스코프 규칙 셋
 * (블록마다 · 함수마다 · 하나뿐)으로 한 번 읽는다. 쌓이는 표가 4 → 2 → 1 장으로 줄고, 쓰임 열둘 가운데 여섯이
 * 다른 선언에 닿는다. 걸림은 블록마다 1(L9 `last` 선언 없음) · 함수마다 1(L8 두 번 선언) · 하나뿐 3.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `resolveToDeclaration` 은 쓰임 하나가 안쪽에서 바깥으로 찾는 걸음을, `tablePerScope` 는 표를 얹고 적고 걷는 사건을 쥔다 —
 * 둘 다 블록 스코프 하나에서. 이쪽은 둘을 한 걸음에 묶고 **규칙이 선을 옮긴다**는 대비를 맡는다. 그래서 definition 은
 * per-block · per-function · single table · redeclaration · undeclared 를 쥐고, innermost outward · push · pop 을 쓰지 않는다.
 *
 * 전제 (설명 글 `scopeAndSymbols.md` 가 밝힌 것):
 *  - 블록마다 ≈ 자바스크립트 `let` (자바 · C# 은 L8 같은 안쪽 다시 선언을 막는다), 함수마다 ≈ 자바스크립트 `var`
 *    (단 `var` 은 두 번 선언을 들이는데 여기선 걸린다), 하나뿐 ≈ 옛 BASIC.
 *  - 값을 셈하지 않고, L10 에서 `fill` 을 불러도 몸으로 들어가지 않는다.
 *  - 코드 패널은 IR 을 여섯 언어로 옮긴 이름 해석기(`scopeFor` 가 가운데)다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const scopeAndSymbolsConcept: FacetConceptSource = {
  id: 'scopeAndSymbols',
  label: 'Scope Rules and Symbol Tables (Per Block, Per Function, Global)',
  canonicalFacet: 'facet:scopeAndSymbols',

  surface: {
    definition:
      'Whether a language opens a symbol table per block, per function, or keeps a single global one decides which declaration each identifier binds to, which uses become undeclared, and which declarations collide as duplicates.',
    exemplarKeywords: [
      'block scope vs function scope',
      'let vs var in JavaScript',
      'var is function-scoped',
      'global scope only',
      'old BASIC variables',
      'symbol table',
      'name binding',
      'redeclaration error',
      'variable is not defined',
      'lexical scoping rules',
      'scope rules compared',
      'semantic analysis',
    ],
  },

  briefing: {
    observable: [
      'Ten lines are read top to bottom once: `let size = 10`, `let i = 0`, `function fill(n)`, `let size = n * 2`, `for i from 1 to n`, `let last = i * size`, `if n > size`, `let size = 0`, `return size + last + i`, `show fill(3) + size + i`. A stack of symbol tables beside it is searched from the top.',
      'Each line is one step, 11 in all including step 0 (one empty outermost table). Per line: tables of bodies just left are lifted off, used names are looked up from the top table down, the line\'s declaration is written into the table the rule picks, and a header line (`function`, `if`, `for`) may stack a new table.',
      'Per block (starting position) stacks a table for every `function`, `if` and `for` body: 4 tables made, height 3, 11 links, 1 error — `last` on L9 finds no declaration after scanning both tables.',
      'Per function stacks only the `function` body: 2 tables, 12 links, 1 error. The L9 `i` line jumps from L2 to L5, the L9 `last` now reaches L6, and L8\'s `size` collides with L4\'s in the same table — "declared twice".',
      'Just one keeps the outermost table only: 1 table, 12 links, 3 errors. The declarations on L4, L5 and L8 bounce off the outermost table\'s same names, and five uses that pointed inward are pulled down to L1 and L2.',
      'Six of the twelve uses reach a different declaration depending on the rule. When the handle moves, the previous links stay as dashed traces at step 0, and each new link bends away from its trace on the step that looks that use up.',
      'The three rules are a toy language\'s. Per block is close to JavaScript `let` (Java and C# also scope by block but forbid an inner body redeclaring a local, as L8 does); per function is close to JavaScript `var`, except that `var` quietly accepts redeclaration where this screen counts an error; just one is close to old BASIC. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Scope rule", with three positions: Per block (starting position), Per function and Just one. Three readouts — "Tables made", "Links" and "Errors" — end each round at 4 · 11 · 1, 2 · 12 · 1 and 1 · 12 · 3.',
        'The move that makes the idea land is stepping from Per block to Per function: the L9 `last` that had no declaration suddenly reaches L6, and an error appears on L8 instead.',
        'The code panel, labelled "Name resolver", starts empty with a "+ Add language" button. Its centre is `scopeFor`, the one function the handle changes — which scope a declaration goes into. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains the difference between `let` and `var` in JavaScript and needs one program where a variable declared inside a loop is visible after it under one rule and missing under the other.',
      'A reader asks why moving from block scoping to function or global scoping can turn an earlier shadowing into a duplicate-declaration error, and the article wants the collisions counted per rule.',
    ],

    avoidWhen: [
      'The subject is closures, captured variables or lifetimes at run time. No value is stored and no call is followed into its body.',
      'The article is about hoisting or the temporal dead zone. Declarations here are seen only after the line that makes them.',
      'The article is about dynamic scoping, where lookup follows the call chain. Lookup here follows how the text is nested.',
    ],

    contrastWith: [
      {
        concept: 'resolveToDeclaration',
        note: 'Searching outward to the nearest declaration is one fixed procedure. Varying how many tables a language stacks is what makes the same procedure land on different declarations.',
      },
      {
        concept: 'tablePerScope',
        note: 'Pushing and popping a table per body is how a compiler records declarations under block scoping; the scope rule decides which bodies get a table at all.',
      },
      {
        concept: 'shadowing',
        note: 'Shadowing is about which variable holds a value while a program runs. Scope resolution settles the question before running, from the text alone, and its answer depends on the scope rule.',
      },
      {
        concept: 'scopeExit',
        note: 'A block-scoped name ceasing to exist is one consequence of the per-block rule; under a per-function rule the same name outlives its block.',
      },
      {
        concept: 'typeChecking',
        note: 'Both are semantic checks after parsing. Scope resolution ties uses to declarations; type checking then asks whether the types of what was found fit together.',
      },
    ],
  },
};

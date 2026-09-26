/**
 * tablePerScope 개념 선언.
 *
 * canonical facet 은 `facet:tablePerScope` — 열 줄(`limit` · `scale(x)` · `for i` · `if`)을 한 번 읽으며, 몸이 열릴 때 이름 표를
 * 얹고, 선언을 맨 위 표에 적고, 몸이 끝나면 맨 위 표를 적힌 이름째로 걷는다. 표 넷(맨 바깥 포함) · 얹기 셋 · 걷기 셋 ·
 * 적힌 이름 일곱 · 가장 높이 셋, 끝에 맨 바깥 표와 `limit` · `scale` 만 남는다. 12 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * `scopeAndSymbols`(완제품)는 규칙에 따라 표의 장수가 달라지는 대비를, `resolveToDeclaration` 은 쓰임을 선언에 잇는 쪽을 쥔다.
 * 이쪽은 **적는 쪽의 자료 구조** — 표 더미를 얹고 걷는 사건 — 을 쥔다. 그래서 definition 은 push · record · top table · pop ·
 * entries discarded 를 쥐고, use · lookup · innermost outward · per-function 을 쓰지 않는다.
 *
 * 전제: 장난감 언어의 블록 스코프. 표를 스택으로 쌓는 것은 여러 구현 가운데 하나이고, 표에는 이름만 적었다(실제 컴파일러는
 * 타입 · 자리를 함께 적는다). 프로그램을 돌리지 않으니 `for` 몸이 세 번 돌아도 표는 한 번씩만 얹힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tablePerScopeConcept: FacetConceptSource = {
  id: 'tablePerScope',
  label: 'A Symbol Table per Scope, Pushed and Popped',
  canonicalFacet: 'facet:tablePerScope',

  surface: {
    definition:
      'A compiler reading source once pushes a new symbol table when a body opens, records each declaration in the topmost table, and pops that table with all its entries when the body closes.',
    exemplarKeywords: [
      'symbol table',
      'scope stack',
      'stack of symbol tables',
      'enter scope and exit scope',
      'push and pop a scope',
      'symbol table implementation',
      'nested scopes in a compiler',
      'where declarations are stored',
      'single pass over the source',
      'semantic analysis data structure',
    ],
  },

  briefing: {
    observable: [
      'Ten lines on the left, a pile of name tables on the right. The program opens with `let limit = 3`, then a function `scale(x)` over L2–L4, a `for` loop over L5–L9 with an `if` inside it over L7–L9, and ends with `show limit`.',
      'Step 0 shows one empty outermost table. After that each event is one step, 12 steps in all: a table stacked on top, a name written into the top table, or the top table lifted off.',
      'At a header line (`function`, `for`, `if`) a new table goes on top; the parameter `x` and the loop variable `i` arrive already written in it, while the `if` table starts empty. `function scale(x)` first writes `scale` into the outermost table, then stacks the body\'s table.',
      'After the last line of a body the top table is lifted off with every name in it: after L4 the `scale` body table goes with `x` and `factor`; after L9 the `if` body table goes first and then the `for` body table, inner before outer.',
      'The counts: four tables made, three stacked and three lifted, seven names written (`limit`, `scale`, `x`, `factor`, `i`, `y`, `big`), and a greatest height of three while the `if` table is on. Reading ends with only the outermost table holding `limit` and `scale`. L10 declares nothing, so it is not a step.',
      'Uses of names, such as `x` in `return x * factor`, are not steps; only the writing side is shown. Running the program would pass through the `for` body three times and call `scale` three times, but the text is read once, so each table goes on and comes off once.',
      'Scopes follow a toy language\'s block rule — the outermost plus one per `function`, `for` and `if` body, marked by indentation. Only names are written; real compilers also store types and locations, and some keep tables instead of discarding them.',
    ],

    screen: {
      affordances: [
        'The screen plays the reading by itself, one table event per step, and stops once the `for` body table is lifted.',
        'A Replay button and a playback strip sit below it. Holding the strip where the `if` table is on shows the pile at its greatest height of three.',
        'The program is fixed, so every table name and counter ("Tables stacked") can be quoted as it appears.',
      ],
    },

    useWhen: [
      'The article describes how a compiler implements nested scopes and needs the stack of tables growing and shrinking as bodies open and close.',
      'A reader wonders why the compiler does not handle a loop body once per iteration, and the article needs a single table for a body the program would run three times.',
    ],

    avoidWhen: [
      'The article is about which declaration a use resolves to. Uses are not steps here.',
      'The subject is the call stack or stack frames at run time. These tables exist only while the compiler reads the text.',
      'The article compares scope rules across languages. Only block scope is used.',
    ],

    contrastWith: [
      {
        concept: 'scopeAndSymbols',
        note: 'Pushing a table per body is the mechanism under block scoping. A scope rule that opens tables only for functions, or only one table overall, changes how many get pushed.',
      },
      {
        concept: 'resolveToDeclaration',
        note: 'Filling and discarding tables is the recording side; resolving a use is the lookup that reads those tables from the top down.',
      },
      {
        concept: 'scopeExit',
        note: 'A name vanishing when its block ends is what a program observes; popping the body\'s table with its entries is how the compiler makes that true.',
      },
      {
        concept: 'callStackUnwind',
        note: 'Both stack one layer per nesting level and remove the newest first, but stack frames exist per call while a program runs, whereas symbol tables exist per body of text, once, while it is compiled.',
      },
    ],
  },
};

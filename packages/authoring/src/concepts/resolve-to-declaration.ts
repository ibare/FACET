/**
 * resolveToDeclaration 개념 선언.
 *
 * canonical facet 은 `facet:resolveToDeclaration` — 아홉 줄에 `step` 이 두 번(L2 · L4), `n` 이 두 번(L3 인자 · L7) 선언되어 있다.
 * 쓰임 아홉이 차례로 선언에 선으로 이어진다. 찾기는 쓰임을 감싼 가장 안쪽 몸에서 시작해 한 겹씩 넓히고, 처음 만난 선언에서 멈춘다.
 * L5 의 `step` 은 L4 로, L8 의 `step` 은 L2 로 — 부르는 차례가 아니라 글이 감싼 모양이 정한다. 10 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * `scopeAndSymbols`(완제품)는 규칙을 바꾸면 선이 옮겨 가는 대비를, `tablePerScope` 는 선언을 적는 쪽(표의 얹기 · 적기 · 걷기)을 쥔다.
 * 이쪽은 **쓰는 쪽** — 쓰임 하나가 어느 선언을 가리키는가 — 를 쥔다. 그래서 definition 은 use · innermost · outward · first match ·
 * textual nesting · call order 를 쥐고, table · push · pop · per-function 을 쓰지 않는다.
 *
 * 전제: 장난감 언어의 블록 스코프(맨 바깥 + `function` · `if` · `for` 몸마다). 선언은 쓰임보다 위에 있어야 보인다.
 * 파이썬은 `if` 몸이 스코프가 아니고, 자바스크립트 `var` 는 함수 몸 전체가 한 스코프다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const resolveToDeclarationConcept: FacetConceptSource = {
  id: 'resolveToDeclaration',
  label: 'Resolving a Name to Its Declaration',
  canonicalFacet: 'facet:resolveToDeclaration',

  surface: {
    definition:
      'Name resolution links each use of an identifier to one declaration by searching the innermost enclosing body first, widening outward, and stopping at the first match; textual nesting, not call order, decides it.',
    exemplarKeywords: [
      'name resolution',
      'identifier lookup',
      'which variable does this name refer to',
      'nearest enclosing scope',
      'lexical scope',
      'static scoping',
      'same name declared twice',
      'go to definition',
      'binding a use to a declaration',
      'inner scope searched first',
      'scope chain lookup',
    ],
  },

  briefing: {
    observable: [
      'Nine lines — `let total = 0`, `let step = 2`, `function add(n)` with `let step = 5` and `total = total + n * step` in its body, then `if total == 0` with `let n = 1` and `add(n + step)` in its body, and finally `show total` — declare `step` twice (L2, L4) and `n` twice (the parameter on L3, and L7). Bodies are marked "Outermost", "Body of add" and "Body of if".',
      'Reading goes top to bottom, left to right within a line. Each use found draws a line to a declaration — "total on L5 → declaration on L1" — and a counter shows how many scopes were searched. Ten steps including step 0.',
      'L5 `total = total + n * step` is inside `add`: both `total` uses search two scopes (Body of add, then Outermost) and reach L1; `n` reaches the parameter on L3 and `step` reaches L4, each after one scope. The search stops at L4 and never looks at the outer `step` on L2.',
      'L8 `add(n + step)` is inside the `if` body: `add` searches two scopes and reaches L3, `n` reaches L7 after one, and `step` searches two and reaches L2. The body of `add` does not enclose L8, so its `step` is not visible there even though L8 calls `add`.',
      'The assignment `total = …` on L5 has no `let`, so its left side is a use too, looked up like the right-side `total`. The run ends with 9 links; all six declarations are used at least once, and four uses gather on `total` at L1.',
      'The scope rule is a toy language\'s block scope: one outermost scope plus one per `function`, `if` and `for` body. A declaration must be above the use to be seen, and a closed body is no longer searched. Python would put L7\'s `n` in the outermost scope because an `if` body is not a scope there.',
    ],

    screen: {
      affordances: [
        'The screen plays the lookups by itself, one use per step, and stops after the last `total` on L9.',
        'A Replay button and a playback strip sit below it. Holding the strip on step 4 and then step 8 shows the two `step` uses reaching different declarations.',
        'The program is fixed, so each link and each "Scopes searched" count can be quoted as it appears.',
      ],
    },

    useWhen: [
      'The article explains why the same identifier in two places of a program can mean two different variables, and needs each use tied visibly to the declaration it reaches.',
      'A reader thinks a function call makes the callee\'s local names visible at the call site, and the article needs a use inside the caller that skips the callee\'s declaration.',
    ],

    avoidWhen: [
      'The article is about values changing or being restored at run time. Nothing is evaluated here.',
      'The subject is dynamic scoping or late binding. Every lookup here is settled from the source text.',
      'The article compares block scope with function scope or global scope. Only one rule is used.',
    ],

    contrastWith: [
      {
        concept: 'scopeAndSymbols',
        note: 'The outward search is the same under any scope rule; changing which bodies count as scopes is what moves the declaration a use lands on.',
      },
      {
        concept: 'tablePerScope',
        note: 'Recording declarations is the writing side of scope handling; resolving a use is the reading side that consults what was recorded.',
      },
      {
        concept: 'shadowing',
        note: 'Shadowing describes the effect of an inner declaration hiding an outer one while code runs. Resolution is the compile-time rule behind it: the innermost match wins and the search stops there.',
      },
    ],
  },
};

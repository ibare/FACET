/**
 * oneFunctionPerRule 개념 선언.
 *
 * canonical facet 은 `facet:oneFunctionPerRule` — 장난감 문법 다섯 규칙(`Stmt → show Expr` · `Expr → Atom + Atom` ·
 * `Atom → ( Expr ) | NAME | NUM`)을 함수 셋(`stmt` · `expr` · `atom`)으로 옮긴 파서가 `show (a + 1) + b` 의 토큰 8 을
 * 읽는다. 한 걸음 = 부름 하나 또는 돌아옴 하나(15 걸음 = 부름 7 · 돌아옴 7 + 처음). 괄호 안에서 두 번째 `expr` 가
 * 첫 `expr` 를 멈춰 둔 채 깊이 5 까지 내려간다. 먹힌 토큰은 먹은 함수 몫으로 남는다(stmt 1 · expr 2 · atom 5).
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `recursiveDescent` 는 중첩 · 문법 손잡이로 깊이와 왼쪽 재귀의 무너짐을 견준다. `lookaheadOne` 은 갈래를
 * 고르는 들여다보기다. 이쪽은 **문법을 코드로 옮기는 대응 하나** — 비단말은 부름, 단말은 먹기, 몸의 끝은 돌아옴.
 * 그래서 definition 은 each nonterminal · its own function · call for a nonterminal · consume for a terminal ·
 * return 을 쥐고, 완제품의 depth limit · left recursion · nesting, 형제의 peek · FIRST 를 쓰지 않는다.
 *
 * 전제: 함수 안 코드는 어느 한 언어도 아닌 표기(`tasks/pseudo-notation.md` — `function` · `eat` · `peek` · `throw`)다.
 * 문법은 예로 만든 장난감이고 왼쪽 재귀가 없다. `atom` 의 갈래 고르기(LL(1))는 걸음으로 세지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const oneFunctionPerRuleConcept: FacetConceptSource = {
  id: 'oneFunctionPerRule',
  label: 'One Function per Grammar Rule',
  canonicalFacet: 'facet:oneFunctionPerRule',

  surface: {
    definition:
      'Hand-writing a parser by giving each nonterminal its own function: the body follows its rule left to right, calling the function for every nonterminal and consuming every terminal token, then returns to its caller.',
    exemplarKeywords: [
      'recursive descent parser structure',
      'grammar to code',
      'parse function per nonterminal',
      'hand-written parser',
      'top-down parsing',
      'mutual recursion expr atom',
      'eat or consume a token',
      'parser call and return',
      'nested parentheses parsing',
      'predictive parser functions',
    ],
  },

  briefing: {
    observable: [
      'On one side stand three functions, each under its rule: `Stmt → show Expr` over `function stmt()` (`eat("show")`, `expr()`), `Expr → Atom + Atom` over `function expr()` (`atom()`, `eat("+")`, `atom()`), and `Atom → ( Expr ) | NAME | NUM` over `function atom()` with an `if peek() == "("` / `else if` chain ending in `throw Unexpected`.',
      'An Input row holds the eight tokens `SHOW show` · `PUNCT (` · `NAME a` · `OP +` · `NUM 1` · `PUNCT )` · `OP +` · `NAME b` followed by `EOF`. The start reads "No function called yet. Tokens: 8", with an "outside" marker and "Depth: 0".',
      'One step is one move of control between functions — a call or a return — and any tokens the current function ate on the way belong to that step: "stmt() eats SHOW show, then calls expr()." The lines passed through light up inside the function.',
      'Inside the parentheses `atom` calls `expr` again: the first `expr` stays paused at its `atom()` line while a second `expr` starts one level deeper, and control goes down to "Depth: 5".',
      'After `a + 1` is read, control climbs back out one level at a time, eats `)`, and the outer `expr` finishes the remaining `+ b`.',
      'The last step reads "stmt() is done — back outside. Next: EOF · Eaten: 8 / 8". Fifteen steps with the start: 7 calls and 7 returns. Calls per function are stmt 1 · expr 2 · atom 4, and tokens eaten are stmt 1 (`show`) · expr 2 (`+`, `+`) · atom 5.',
      'The code is written in a small language-neutral notation — `function`, `eat`, `peek`, `throw` — not in any one real language. The grammar is a toy with no left-recursive rule; choosing among `Atom`\'s three alternatives by peeking is not counted as a step.',
    ],

    screen: {
      affordances: [
        'The screen plays the parse by itself, one call or return per step, and stops when `stmt` returns outside.',
        'A Replay button and a playback strip sit below. Dragging to the deepest point holds both `expr` activations open at once, one paused and one running.',
        'Grammar, functions and tokens are fixed, so every caption and count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article claims a recursive-descent parser is the grammar written as code, and needs each rule seen as a function whose body is the rule itself.',
      'A reader cannot picture how `expr` can be running twice at once; the paused outer `expr` and the active inner one inside the parentheses show it directly.',
    ],

    avoidWhen: [
      'The article is about left recursion breaking a top-down parser. The grammar here avoids it and the failure is not drawn.',
      'The subject is how the alternative is picked from the next token, FIRST sets or LL(1) tables. That choice happens but is not a step here.',
      'The topic is building a syntax tree during parsing. The functions only recognise and consume; no tree is produced.',
    ],

    contrastWith: [
      {
        concept: 'recursiveDescent',
        note: 'Rules becoming functions is the design itself. How deep those functions nest on growing input, and how the design collapses when a rule starts with its own name, are its consequences.',
      },
      {
        concept: 'lookaheadOne',
        note: 'Following a rule body is what each function does once an alternative is chosen; choosing it from the next token without consuming it is the separate decision made before the body starts.',
      },
      {
        concept: 'returnToCaller',
        note: 'Returning to the caller is the general function mechanism. In a parser, what each return means is that one grammar rule has been matched completely.',
      },
      {
        concept: 'ruleExpands',
        note: 'A derivation uses rules to produce a sentence from the start symbol. A parser uses the same rules in the other direction, to confirm a given token sequence fits them.',
      },
    ],
  },
};

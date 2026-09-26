/**
 * ruleExpands 개념 선언.
 *
 * canonical facet 은 `facet:ruleExpands` — 규칙 다섯 줄(`Call → NAME ( Args )` · `Args → Arg , Args | Arg` ·
 * `Arg → NAME | NUM`)로 `max(x, 1, y)` 의 토큰 여덟에 닿는 가장 왼쪽 유도를 한 줄 위에서 보인다. 가장 왼쪽
 * 비단말이 사라지고 그 자리에 몸이 벌어진다. `R2` 로 펼친 `Args` 는 몸 안에서 제 이름을 다시 낳아 더 오른쪽에
 * 선다. 펼침 일곱, 줄 길이 1 · 4 · 6 · 6 · 8 · 8 · 8 · 8. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이쪽은 **차례와 재귀 규칙**이다 — 몇 줄의 규칙이 어떻게 얼마든지 긴 목록을 낳는가. 지난 줄은 남기지 않는다.
 * `derivationTree` 가 그 자취를 모은 모양(나무 · 잎)을 가져가므로 definition 에 tree · leaves · hang 을 넣지 않고,
 * sentential form · replaced · reintroduces its own name · any length 를 독점한다.
 *
 * 전제: 문법은 이 그림을 위해 만든 장난감 문법, 입력은 이미 토큰으로 잘려 종류(`NAME` · `NUM`)와 글자(괄호 · 쉼표)로
 * 문법에 보인다. 어느 갈래로 펼칠지는 목표 토큰 열에 닿는 유도를 찾아 정했고 그런 유도는 하나뿐이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ruleExpandsConcept: FacetConceptSource = {
  id: 'ruleExpands',
  label: 'A Recursive Rule Expands Itself (Leftmost Derivation)',
  canonicalFacet: 'facet:ruleExpands',

  surface: {
    definition:
      'In a leftmost derivation each step replaces the leftmost nonterminal of the sentential form with a rule body; a rule whose body contains its own name reintroduces that name further right, so a few rules generate lists of any length.',
    exemplarKeywords: [
      'leftmost derivation',
      'sentential form',
      'recursive production',
      'grammar rule for an argument list',
      'Args → Arg , Args',
      'comma-separated list grammar',
      'how a finite grammar makes infinite sentences',
      'rewriting a nonterminal',
      'context-free grammar production',
      'BNF recursion',
    ],
  },

  briefing: {
    observable: [
      'A Grammar box lists five rules: R1 `Call → NAME ( Args )`, R2 `Args → Arg , Args`, R3 `| Arg`, R4 `Arg → NAME`, R5 `| NUM`. Below it sits the Goal — "tokens of max(x, 1, y): 8" — as `NAME ( NAME , NUM , NAME )`.',
      'The line starts with only the start symbol: "The line holds only the start symbol: Call", "Symbols in the line: 1", "Nonterminals left: 1".',
      'Each step the leftmost nonterminal shrinks away and the rule body opens in its place, pushing the symbols to its right further along: "R1: Call gave way to its body." turns the line into `NAME ( Args )`.',
      'When `Args` is expanded by R2, the caption adds "and the same name stands again further right" — the body `Arg , Args` carries `Args` again, waiting for the next expansion. Expanding `Args` by R3 brings a body without its own name, and the regrowth stops.',
      'Seven expansions in all, two of them R2, so `Args` is expanded three times. The line length goes 1 · 4 · 6 · 6 · 8 · 8 · 8 · 8.',
      'The last step reads "R4: Arg gave way to its body. No nonterminal left, so expanding stops." with "Nonterminals left: 0", and the line matches the Goal cell for cell. Eight steps with the start.',
      'The grammar is a toy made for this picture; the input is already tokenized. Only the order of expansions is shown — earlier lines are not kept.',
    ],

    screen: {
      affordances: [
        'The screen plays the derivation by itself, one expansion per step, and stops when no nonterminal is left.',
        'A Replay button and a playback strip sit below. Dragging back and forth over the two R2 steps shows `Args` disappearing and reappearing to the right.',
        'Grammar and goal are fixed, so every line and caption can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article needs to show how a handful of grammar rules can describe an argument list of three items or thirty, and wants the self-referencing rule seen producing its own name again.',
      'A reader meets derivations for the first time and needs the mechanics of one rewriting step — which symbol is replaced, where the body goes, when rewriting stops.',
    ],

    avoidWhen: [
      'The article is about the tree a derivation builds or reading the sentence off its leaves. Only a single line is kept; no tree appears.',
      'The subject is how a parser decides which rule to use from the input. The choice is fixed in advance to reach the goal; no lookahead or table is involved.',
      'The topic is left recursion causing a parser to loop. The recursive rule here recurs at the right end of its body.',
    ],

    contrastWith: [
      {
        concept: 'derivationTree',
        note: 'Rewriting one line at a time is about order and about how recursion lets a list grow. Keeping every expansion instead yields a tree, whose shape is independent of that order.',
      },
      {
        concept: 'oneFunctionPerRule',
        note: 'A derivation runs the grammar forwards to produce a sentence. A recursive-descent parser runs the same rules to recognise one, turning each rule into a function that consumes tokens.',
      },
      {
        concept: 'recursionSelfCall',
        note: 'A rule naming itself in its body and a function calling itself share the idea of self-reference; one generates longer strings, the other starts another invocation of the same code.',
      },
      {
        concept: 'splitIntoTokens',
        note: 'Cutting source text into tokens comes first and produces the terminals a grammar talks about. Derivation works one level up, on those token kinds rather than on characters.',
      },
    ],
  },
};

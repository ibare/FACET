/**
 * conditionalStatement 개념 선언.
 *
 * canonical facet 은 `facet:conditionalStatement` — 마름모 분기 + 켜진 길과 빗장 그어진
 * 길 + 좌측 개념 서술 및 안내.
 *
 * reactive 다. 값 슬라이더를 움직이면 결과가 마름모에서 다시 응결된다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const conditionalStatementConcept: FacetConceptSource = {
  id: 'conditionalStatement',
  label: 'Conditional (if / else if / else)',
  domain: 'programming-fundamentals',
  canonicalFacet: 'facet:conditionalStatement',

  surface: {
    definition:
      'A fork in control flow that evaluates conditions in order, takes exactly the first branch whose condition holds, and rejoins into a single path afterwards.',
    exemplarKeywords: [
      'if statement',
      'else if',
      'conditional branch',
      'control flow',
      'boolean condition',
      'branching',
      'exactly one path runs',
      'flowchart',
      'short-circuit evaluation order',
      'guard clause',
    ],
  },

  briefing: {
    observable: [
      'The condition condenses to true or false at the diamond, and only then does a branch light up — the decision is a single moment, not a gradual one.',
      'The branch not taken is drawn with a bar across it. It is not merely dim: it is marked as closed for this run, which is the visible form of "not a single line of it executes".',
      'Both paths rejoin into one line after the fork, so the flow that continues afterwards is the same regardless of which branch ran.',
      'Switching between two and three branches folds the chain into a single diamond or unfolds it into if / else if / else, showing that the same rule scales.',
      'In the three-branch form, conditions are evaluated top down and the first true one wins — the ones below it are never reached even if they would also hold.',
      'Moving the value re-runs the decision immediately, so the reader can sweep across a boundary and watch the lit path swap.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet with a value slider, a branches toggle (2 or 3), an auto-demo and Reset.',
        'The move that makes the idea land is sweeping the value across a boundary — the swap between lit and barred happens at one exact point.',
        'A side panel already states the rule in full and another explains how to explore. Both are on screen before the reader does anything.',
      ],
    },

    avoidWhen: [
      'The article is about switch statements or pattern matching. Those dispatch on a value rather than evaluating conditions in order, and the top-down chain here would misrepresent them.',
      'The subject is loops or recursion. The flow here forks once and rejoins; nothing returns to an earlier point.',
      'The point is boolean algebra or short-circuit evaluation of operators. This shows which branch runs, not how a single condition is computed.',
    ],

    contrastWith: [
      {
        concept: 'tokenization',
        note: 'Both show a decision resolving in one beat, but a conditional decides which path runs while tokenization decides where one thing ends and the next begins.',
      },
    ],
  },
};

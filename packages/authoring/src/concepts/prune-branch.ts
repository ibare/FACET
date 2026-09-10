/**
 * pruneBranch 개념 선언.
 *
 * canonical facet 은 `facet:pruneBranch` — 조각(piece)이다. 수 넷 `[7, 5, 4, 2]`
 * 에서 골라 합 6 을 만드는 결정나무를 그리되, 다 뻗었을 때의 서른한 자리를 옅은
 * 유령으로 미리 깔고 그 위에 실제로 여는 열다섯만 자라게 한다. 계기도 코드
 * 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `backtracking` 은 절차 전체와 그 결과를, 조각 `tryAndUndo` 는 물림의
 * 복원성을 맡는다. 이 조각이 홀로 맡는 것은 **접는 근거** 다 — 아래를 하나도
 * 보지 않고 발길을 돌려도 답의 집합이 그대로인 것은 요령이 아니라 증명이라는 것.
 * definition 의 주어가 "닫는 일" 이고, keywords 는 가지치기 · 증명 · 탐색 공간
 * 축소 어휘만 갖는다 (형제 둘의 열거 · 되돌림 어휘와 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pruneBranchConcept: FacetConceptSource = {
  id: 'pruneBranch',
  label: 'Pruning a Branch (Skipping a Subtree Safely)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:pruneBranch',

  surface: {
    definition:
      'Closing a node without exploring beneath it, licensed by a test proving no answer can lie below, so the reduced search still returns the same answers.',
    exemplarKeywords: [
      'pruning',
      'prune the search tree',
      'cut off a subtree',
      'subset sum',
      'the partial sum already exceeds the target',
      'feasibility test',
      'search space reduction',
      'combinatorial explosion',
      'why skipping is safe',
      'never lose an answer',
      'order the candidates so branches close early',
    ],
  },

  briefing: {
    observable: [
      'The full tree of thirty-one spots is laid down first as a faint dotted ghost and is never erased, so the part that is never opened stays measurable against the part that is.',
      'Branches actually grow: a line extends out of the parent and the spot swells at its end, rather than fading in where it will be.',
      'A spot whose running sum has passed the target turns red and a lid spreads sideways beneath it, and a pale sheet sweeps downward over the ghost region under that lid, which stays empty for the rest of the run.',
      'Two tallies sit in the corner — spots opened and spots never opened — and the second one jumps by the size of the subtree each time a lid closes, not by one.',
      'The caption at a closing spot states the arithmetic rather than the verdict: the running sum, the target, and the count of spots below that will never be opened.',
      'Three spots close in this run and the answer is still found, and the closing caption puts the two counts next to the claim that no answer was lost.',
      'The left gutter labels which number each level decides, and a legend says the left branch takes the value while the right branch leaves it out.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole descent on its own and stops with the tree half grown and the skipped region still blank.',
        'Two buttons: Replay, and a step control that rewinds and walks the same descent one spot at a time, which is how a reader can stop on the moment a lid spreads.',
        'The numbers and the target are fixed, so an article can name the value that closes the first branch and the pair that adds up to the target.',
      ],
    },

    useWhen: [
      'The article calls pruning an optimisation and the reader hears "approximation". Seeing the answer still reached after three subtrees were never entered is what separates skipping known-empty ground from guessing.',
      'A reader needs to feel how a single cut pays: the never-opened tally rising by sixteen at once, from three decisions, while the opened tally rises by one at a time.',
      'The prose is about the condition a cut needs in order to be sound, and the screen supplies a case where the condition is arithmetic small enough to check by eye — the running sum has already passed the target and every remaining value is positive.',
    ],

    avoidWhen: [
      'The article is about pruning a neural network, dropping weights or channels to shrink a model. The word is shared and the subject is not.',
      'The subject is pruning in a database query planner, a build graph, or a package dependency tree, where what is removed is redundant work rather than a proven-empty region of a search.',
      'The point is a bound computed from an optimistic estimate of what a branch could still achieve. Here the test is that a constraint is already broken, which is cheap and certain in a way an estimate is not.',
      'The article works with values that can lower a running total — negative numbers, refunds, penalties. The cut shown here relies on the total only ever growing.',
    ],

    contrastWith: [
      {
        concept: 'backtracking',
        note: 'That search enters every branch that stays legal and retreats when it fails; pruning refuses whole branches before entering them, on a proof that they hold nothing.',
      },
      {
        concept: 'tryAndUndo',
        note: 'Both handle a branch that leads nowhere, but a retraction happens after the walk and a cut happens instead of it.',
      },
      {
        concept: 'boundAndCut',
        note: 'Two grounds for the same act: this one cuts because a rule is already broken, that one cuts although nothing is broken yet, because the best still reachable cannot beat what is already in hand.',
      },
      {
        concept: 'branchAndBound',
        note: 'The full method built on cutting by estimate, where computing a sharp bound is half the work; here the test is a single comparison and the subject is why cutting loses nothing.',
      },
    ],
  },
};

/**
 * boundAndCut 개념 선언.
 *
 * canonical facet 은 `facet:boundAndCut` — 조각이다. 갈래마다 자리 하나가 서고
 * 막대가 두 토막(찬 값 + 쪼개서라도 채운 몫)으로 선다. 판을 가로지르는 줄이
 * 지금까지의 최고이고 재생 도중에 0 → 12 → 27 로 올라간다. 막대 끝이 줄에 못
 * 미치면 밑동에 칼이 지나가고 막대가 주저앉되 잰 자국은 남는다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `branchAndBound` 가 탐색 절차 전체를 맡으므로, 이 조각의 definition 은
 * **판정 한 걸음**에 무게중심을 둔다 — 아무것도 어기지 않은 갈래를 접는 이유,
 * 그리고 그 기준이 고정값이 아니라 재생 도중 올라간다는 것. definition 에
 * "search" 나 "exact" 를 쓰지 않는 것이 갈라 두는 장치다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const boundAndCutConcept: FacetConceptSource = {
  id: 'boundAndCut',
  label: 'Bound and Cut (Pruning a Branch That Broke No Rule)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:boundAndCut',

  surface: {
    definition:
      'Discarding a still-legal branch because an optimistic ceiling on its best possible outcome cannot exceed the value already achieved, a threshold that rises whenever a better outcome is found.',
    exemplarKeywords: [
      'pruning',
      'bounding function',
      'incumbent best',
      'optimistic estimate',
      'cannot beat the best so far',
      'cut off a feasible branch',
      'relaxing the problem to get a ceiling',
      'why prune before anything is violated',
      'a better solution found early prunes more',
    ],
  },

  briefing: {
    observable: [
      'A strip along the top carries the three items with their weight and value, plus a pill giving the capacity, and it stays put while the board below fills.',
      'Each branch takes its own column on a ruled board and stands there as a bar in two parts: a solid lower part for what is really packed, and a dashed upper part for the extra a split item could contribute.',
      'A line runs across the whole board at the best complete value found so far, with the number in a box on the right, and both climb during the run — from 0 to 12 and then to 27.',
      'When a bar\'s top ends below that line a cut crosses its base and the bar drops away, leaving the measured outline behind so an abandoned branch is still there to be counted.',
      'The two branches that are cut have broken nothing — their packed weight sits well under the capacity — and the caption gives only the arithmetic, naming the ceiling and the value it fails to beat.',
      'The run ends stating two branches cut with the best still 27, so the reader can check that cutting did not cost the answer.',
    ],

    screen: {
      affordances: [
        'The board measures branch after branch on its own and stops on the final count, with every column and every cut still on screen.',
        'Two buttons: Replay, and a step control — the way to stop on a branch after its bar has been measured but before the cut lands.',
        'Three items and a capacity of 5 are fixed, so an article can name the ceilings 24.0 and 23.0 and the 27 they fail against.',
      ],
    },

    useWhen: [
      'The article uses "pruning" for two different things and the reader merges them. Here nothing is violated, and the entire reason offered for abandoning a branch is arithmetic about what it could reach.',
      'A passage claims that finding a good answer early makes the rest of the work cheaper. The mechanism is the threshold line rising mid-run, after which every later branch is measured against a higher bar.',
      'The reader needs an optimistic estimate to be a quantity rather than a word: the dashed part of each bar is exactly the concession that makes the ceiling computable, stacked on top of what is really there.',
      'The prose must justify that discarding branches is safe. Each cut column keeps its outline, so the run ends with the discarded branches and the surviving answer visible together.',
    ],

    avoidWhen: [
      'The subject is turning back from a state that breaks a constraint. A branch that overflows the capacity never even appears on this board.',
      'The article is about heuristic or approximate search that may return something worse than the optimum; the cuts here only remove branches that provably cannot win.',
      'The point is proving that a particular bounding function is valid for a particular problem, rather than what a bound does once you have one.',
      'The topic is cutting planes in integer programming, or a cut in a graph or a network. The word is shared and the mechanism is not.',
      'The article needs the traversal order, the recursion, or the bookkeeping of the search that produces these branches; the columns here are already laid out in the order they were reached.',
    ],

    contrastWith: [
      {
        concept: 'branchAndBound',
        note: 'The test isolated against the procedure that uses it — the branching, the recursion and the counting belong there, and the reason a legal branch may be dropped belongs here.',
      },
      {
        concept: 'pruneBranch',
        note: 'Both stop a branch early; one stops where a rule has been broken and this stops where every rule still holds and only the ceiling is too low.',
      },
      {
        concept: 'takeBestNow',
        note: 'Grabbing the best-looking option immediately is what produces the first decent value, and that value is precisely the threshold everything else is then measured against.',
      },
      {
        concept: 'tryAndUndo',
        note: 'Both retreat from a partly built choice, but undoing is triggered by the state itself failing, and this retreat is triggered by comparison with a result found somewhere else entirely.',
      },
    ],
  },
};

/**
 * greedyCanFail 개념 선언.
 *
 * canonical facet 은 `facet:greedyCanFail` — 액면 9 · 6 · 1 로 12 를 만드는 두
 * 줄을 같은 선반 아래 나란히 굴리는 조각이다. 위 줄은 큰 것부터 집어 넷이 되고
 * 아래 줄은 개수를 최소로 해 둘로 끝난다. 끝에 잣대가 그어져 넘어간 만큼이
 * 붉게 남는다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `greedy` 는 절차와 그 최적성을, `takeBestNow` 는 그 절차의 한 걸음을
 * 맡는다. 이 조각만이 **반례** 를 맡는다 — 같은 규칙이 더 많이 쓰게 되는 입력이
 * 있다는 것, 그리고 그 까닭이 집은 뒤에 남는 몫에 있다는 것. definition 을
 * "실패 조건" 으로 잡아 앞의 둘과 무게중심을 어긋나게 두었고, keywords 는 반례 ·
 * 비정규 화폐 체계 · 동적 계획법으로의 갈아타기에 몰았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const greedyCanFailConcept: FacetConceptSource = {
  id: 'greedyCanFail',
  label: 'When a Greedy Rule Fails (Counterexample)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:greedyCanFail',

  surface: {
    definition:
      'The failure case of a greedy rule: the locally best pick leaves a remainder that can only be filled wastefully, so the run uses more items than the minimum.',
    exemplarKeywords: [
      'greedy is not always optimal',
      'counterexample to a greedy rule',
      'when greedy breaks',
      'minimum number of coins',
      'non-canonical coin system',
      'greedy versus dynamic programming',
      'suboptimal result',
      'why a heuristic needs a proof',
      'local optimum is not global optimum',
      'this heuristic usually works',
    ],
  },

  briefing: {
    observable: [
      'One shelf sits above both rows, so the two rows are visibly drawing from the same denominations rather than from different sets.',
      'Every step sends a coin from the shelf along two diverging paths at once, one to each row, and the first step already sends different denominations to the two.',
      'Coins land in slots of equal width, so the length of a row reads as a count while the diameter of a coin reads as its face value — the row that took the bigger coin first ends up being the longer one.',
      'A column on the right carries the amount each row still has to make; the two figures split at the first step and one reaches zero while the other is still short.',
      'When one row is done and the other is not, only the unfinished row keeps moving, and the caption says how much it still owes.',
      'A measure is drawn under both rows at the end, with the overshoot of the longer row left in red, and the closing caption names both counts and their difference.',
    ],

    screen: {
      affordances: [
        'The screen runs both rows to the end on its own and stops on the verdict.',
        'Two buttons: Replay, and a step control for walking the same run one round at a time — the first round is the one worth stopping on, since that is where the two rows part.',
        'The denominations and the target are fixed, so an article can name the amount left after the first pick and the reader will find it on the right-hand column.',
      ],
    },

    useWhen: [
      'The article has taught a greedy rule that worked and now has to establish that working once is not a guarantee. A single input on which the same rule comes out longer is the whole argument, and it fits in one screen.',
      'The reader blames the failure on a bad choice rather than on the method. Seeing that the bigger coin really was the best available at that moment, and that the damage shows up only in the remainder it left, moves the fault to the absence of lookahead.',
      'The prose is about to justify reaching for a costlier method, and the reader needs a reason to accept the extra machinery before it is introduced.',
      'The article claims a familiar habit — paying with the largest note first — is a rule rather than a convenience of the denominations we happen to use.',
    ],

    avoidWhen: [
      'The subject is a problem where the greedy rule is provably correct, such as scheduling by earliest finish time or building a minimum spanning tree. Presenting a failure there misleads.',
      'The article is about how a dynamic-programming table is filled. The second row here is only the answer that method gives; no table, no subproblems and no recurrence appear.',
      'The point is how to prove a greedy rule correct — exchange arguments, matroids, optimal substructure. This shows only that a proof is needed.',
      'The article uses "greedy" for regular-expression quantifiers or for greedy decoding in a model.',
    ],

    contrastWith: [
      {
        concept: 'takeBestNow',
        note: 'That screen shows the rule succeeding with nothing to compare against; this one puts the same rule beside the smallest possible answer so the gap is visible.',
      },
      {
        concept: 'greedy',
        note: 'Two verdicts on the same shape of method — one problem where committing early provably costs nothing, one input where it costs twice as many items.',
      },
      {
        concept: 'dynamicProgramming',
        note: 'The second row is what that method produces; it earns its cost exactly on inputs where committing early leaves an expensive remainder.',
      },
      {
        concept: 'overlappingSubproblems',
        note: 'The remainder left by a pick is a smaller instance of the same problem, and that is the property the costlier method exploits and the greedy rule ignores.',
      },
    ],
  },
};

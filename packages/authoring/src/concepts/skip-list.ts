/**
 * skipList 개념 선언.
 *
 * canonical facet 은 `facet:skipList` — 손잡이가 원소 수 하나뿐인 완제품이다.
 * 8 · 16 · 32 · 64 · 128 중 하나를 고르면 씨앗이 못박힌 동전으로 층을 짓고, 가장
 * 오래 걸리는 값 하나를 걸어 보인 뒤, 모든 값을 하나씩 찾았을 때의 평균 걸음을
 * 한 층짜리 리스트 · log₂ n 과 나란히 그린다. 그러고는 멈춰 손잡이를 기다린다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 셋의 definition 은 **주어가 다르다.**
 *   skipList        구조 전체와 그 비용 — "log n 으로 자라는데 아무것도 다시
 *                   맞추지 않는다"
 *   skipALayer      탐색 규칙 — "앞으로 가다 지나치면 내려선다"
 *   coinFlipHeight  높이가 정해지는 방식 — "뒷면이 나올 때까지 던진다"
 * 이쪽만 **원소 수에 따른 비용의 움직임**을 말하고, 조각 둘은 그 말을 하지 않는다.
 * keywords 도 이쪽만 규모·대안 구조 어휘(균형 트리와의 견줌, 정렬 맵)를 갖는다.
 *
 * ── 코드 패널을 적지 않은 이유
 *
 * 이 facet 은 IR 을 두지 않는다 (`facets/cs-fundamentals/skip-list/src/irs.ts`).
 * 난수를 이름 붙인 호출로 감추면 핵심이 사라지고 높이를 박으면 무작위성이 죽는다는
 * 판정이라, `layout` 에서도 코드 패널을 뺐다. affordances 에 있다고 쓰면 거짓이 된다.
 *
 * ── 형제 배치를 가리키지 않은 이유
 *
 * `bloomFilter` · `hyperloglog` · `tDigest` 와 "무작위로 적은 비용을 치른다" 는 결이
 * 같지만, 셋은 아직 선언되지 않았고 미선언 참조는 materialize 가 throw 한다
 * (`src/index.ts` 의 validateContrasts). 그 구분 — 여기서는 답이 정확하고 무작위는
 * 모양에만 쓰인다 — 은 definition 과 avoidWhen 이 직접 말하게 두었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const skipListConcept: FacetConceptSource = {
  id: 'skipList',
  label: 'Skip List',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:skipList',

  surface: {
    definition:
      'A sorted structure of linked levels where each value stands on a random number of them, so a lookup costs about log n steps although nothing ever rebalances it.',
    exemplarKeywords: [
      'skip list',
      'probabilistic data structure',
      'randomized alternative to a balanced tree',
      'ordered map without rotations',
      'express lanes over a linked list',
      'logarithmic lookup on average',
      'expected cost rather than guaranteed',
      'sorted set implementation',
      'how many levels for n elements',
      'skip list versus balanced binary search tree',
      'no rebalancing code',
    ],
  },

  briefing: {
    observable: [
      'The levels are drawn one above the other and fill in from the top, each one getting its tick marks and a count at its right end, so the counts arrive in the order that makes the halving visible rather than all at once.',
      'Going up, the ticks get sparser and the counts fall by roughly half, and the run of counts is only roughly halved — some levels miss, which is the difference between halving on average and halving every time.',
      'Values are written out under the bottom level only while there are sixteen or fewer; above that the spacing of the ticks carries the argument instead of the numbers.',
      'The value walked through is the one that costs the most looks, picked by the data rather than chosen, and a dashed vertical guide marks where it sits before the walk starts.',
      'A leap draws the trail forward along the level; an overshoot is drawn differently — a dashed stub out to the value that was too large, which is left greyed out, and then a drop to the level below. The walk never travels to a value it overshot.',
      'Three readouts run along: the looks taken so far, how many levels this build has, and the average over every value once the run finishes. Dropping a level is not counted as a look; only values actually examined are.',
      'On the right, three curves over the five element counts: the average for this structure, the average for a single level, and log₂ n beside them. The chosen count is shaded, and only its two numbers are printed so the curves stay readable.',
      'At eight elements the closing caption says the two are nearly the same, 3.9 against 4.5, and states that the levels cannot earn their keep yet; at a hundred and twenty-eight the same caption reads 10.0 against 64.5.',
      'After the closing line the screen holds still and a second line asks for the handle. Nothing further happens until the element count is moved.',
    ],

    screen: {
      affordances: [
        'One handle: an element count with five settings — 8, 16, 32, 64 and 128 — starting at 16. Moving it rebuilds and replays the whole run at that size.',
        'A play, step, pause, reset and speed bar drives the build and the walk, but once the run has settled the only thing that starts another one is the element count or a reset.',
        'Three readouts beside the controls: looks, levels, and average looks.',
        'The coin is seeded to a fixed value rather than being part of the handle, so a given element count always produces the same levels and the same numbers, and an article can name them.',
      ],
    },

    useWhen: [
      'The article has claimed that a structure can stay fast without anyone maintaining its shape, and the reader will want the cost curve rather than the promise. Sliding the element count from eight to a hundred and twenty-eight draws both averages at every size, with log₂ n laid beside them.',
      'The reader needs to see where levels start paying for themselves. At eight the two averages sit at 3.9 and 4.5 and the screen says so plainly; the gap only opens into 10.0 against 64.5 once there is enough below to skip over.',
    ],

    avoidWhen: [
      'The article is about inserting or removing a value — which links are rewired at each level, and how a height is drawn at the moment a value arrives. Everything here is built in one go and is never touched again.',
      'The subject is the unlucky case, where the draw leaves the upper levels bunched to one side. The coin is seeded to a fixed value, so every run at a given size is the same run.',
      'The point is what one lookup does step by step. A single lookup is walked here, but briefly, and the screen spends the rest of its run on counts and averages.',
      'The article is about a lock-free or concurrent ordered structure, where the interest is in what two writers do to the same links. Nothing runs concurrently here.',
      'The article uses "skip" for skipping rows in a query, for skip connections in a network, or for skipping ahead in a stream.',
    ],

    contrastWith: [
      {
        concept: 'skipALayer',
        note: 'One states the search rule and stops there; this one asks what that rule is worth on average over every value, and how the answer moves as the collection grows.',
      },
      {
        concept: 'coinFlipHeight',
        note: 'One is the rule that produces the shape; this is the claim that a shape arrived at that way costs no more to search than one somebody maintains.',
      },
      {
        concept: 'avlTree',
        note: 'Two ways to keep a lookup cheap: a height difference repaired by rotation on every insertion and deletion, against a shape nobody inspects at all, cheap in expectation rather than guaranteed.',
      },
      {
        concept: 'redBlackTree',
        note: 'Both accept a taller structure than the strictest discipline would allow, but one still holds an invariant that bounds the worst case while this one holds none and answers with a probability instead.',
      },
      {
        concept: 'linkedListSingly',
        note: 'The same chain of links underneath; what changes is that the cost of reaching a value stops being proportional to how many values there are.',
      },
      {
        concept: 'binarySearch',
        note: 'Both get to a value in logarithmic time, but one needs positions it can compute into, and this one needs only links — which is why it survives where address arithmetic is unavailable.',
      },
    ],
  },
};

/**
 * exhaustiveSearch 개념 선언.
 *
 * canonical facet 은 `facet:exhaustiveSearch` — 완결형이다. 위에 후보 예순넷이
 * 점으로 고정되어 있고, 아래에 훑어야 할 양을 담는 판이 있다. 손잡이(차원
 * 2 · 8 · 32 · 128 · 768)를 옮기면 위는 한 칸도 안 움직이는데 아래 타일이 1 에서
 * 384 로 불어난다. 계기 둘(곱셈 · 자리)이 붙어 있고 코드 패널은 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 `compareWithAll` 이 하나도 빠뜨리지 않는 절차와 거기서 쌓이는 값을 맡는다.
 * 이 개념이 홀로 맡는 것은 **두 인수 가운데 어느 쪽이 값을 끌어올리는가** 다 —
 * 후보 수를 못박고 한 벌의 폭만 키워서, 줄여야 할 것이 개수가 아님을 보인다.
 * definition 의 주어가 "한 벌의 폭" 이고, keywords 는 색인이 왜 필요한가 ·
 * 임베딩 차원 어휘를 갖는다 (조각의 전수 · 정확함 어휘와 겹치지 않게).
 *
 * ── 묶음 사이는 어떻게 갈랐나
 *
 * 이 묶음은 **몇 번 재는가** 다. 무엇으로 재는가(각 · 방향 · 잣대 고르기)와
 * 얼마나 줄여 두고 재는가(토막 · 번호 · 되살림)의 어휘를 definition 과
 * keywords 에서 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const exhaustiveSearchConcept: FacetConceptSource = {
  id: 'exhaustiveSearch',
  label: 'Exhaustive Search (Which Factor Actually Drives the Work)',
  canonicalFacet: 'facet:exhaustiveSearch',

  surface: {
    definition:
      'A full pass over every stored vector priced in multiplications, where holding the number of vectors still and widening each one shows that the width of a single vector drives the total, not how many there are.',
    exemplarKeywords: [
      'why vector search needs an index',
      'flat index',
      'embedding dimension and what it costs',
      '768 dimensions',
      'n times d',
      'trimming the candidate set is not enough',
      'the exact baseline every approximate method is judged against',
      'high-dimensional vectors are expensive to hold',
      'cost of one query against a whole collection',
      'the arithmetic behind a similarity search',
    ],
  },

  briefing: {
    observable: [
      'The sixty-four squares along the top hold their count at every setting of the handle — the half of the screen that does not move is as much the claim as the half that does.',
      'The work is drawn as a count of tiles rather than as a length, with one tile fixed at 128 multiplications and never resized, so a 384-fold difference arrives at full scale instead of being folded into a logarithm.',
      'The dashed plate below is sized once for the largest setting, so the smallest setting leaves it almost empty with a single tile and the largest fills it exactly.',
      'The five settings give 1, 4, 16, 64 and 384 tiles, which is the same ladder as the multiplication counter running 128, 512, 2,048, 8,192 and 49,152.',
      'A caret slides along under the squares as batches of eight are taken, and scanned squares fill in behind it, so a pass is visibly a pass rather than a number appearing.',
      'The top right prints what one tile stands for and what a single vector occupies, the latter moving from 8 bytes to 3,072 as the handle moves.',
      'The second counter follows the storage the same way, 512 bytes at the narrowest setting and 196,608 at the widest, so the two costs rise together from one cause.',
      'Tiles land with a small drop rather than appearing, so a step adds a countable quantity even when dozens arrive at once.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. One pass at the middle setting plays on mount and the screen then waits.',
        'A segmented slider beside the playback controls offers five widths — 2, 8, 32, 128 and 768 — starting at 32, and each choice rebuilds the plate and scans the same sixty-four again.',
        'The comparison lives between two settings, so it is the reader who produces it by moving the handle and reading the plate twice; the run itself only ever shows one setting.',
        'The number of stored vectors is not adjustable, which is what lets an article state that it stayed at sixty-four throughout.',
      ],
    },

    useWhen: [
      'An article recommends narrowing the candidate set as the way to make search affordable. Sixty-four squares that never change while the work below them swells is the counterexample in one picture.',
      'A dimension count like 768 or 1,536 has been quoted as a property of a model, with no consequence attached. Here it is the only thing that moves and it moves everything.',
      'The prose is about to introduce an index or an approximate method and needs the exact figure being bought down, stated in the same units the reader will meet again.',
    ],

    avoidWhen: [
      'The question is which quantity the score should be. The comparison is charged as one multiplication per component and never named.',
      'The subject is how an index avoids the pass — a proximity graph, an inverted list of cells, hashing. Nothing here skips anything.',
      'The article means exhaustive in the sense of enumerating arrangements or walking a tree of choices. One flat pass over stored vectors is what is counted here.',
      'The point is measured latency, hardware, batching or memory bandwidth. Every number on screen is the product of two declared quantities.',
      'The growing quantity in the article is the size of the collection. That is the one thing held still here.',
    ],

    contrastWith: [
      {
        concept: 'compareWithAll',
        note: 'Both price a complete pass, but one pins the number of stored vectors and moves only their width to isolate the cause, while the other lets both factors climb and follows the total out of reach.',
      },
      {
        concept: 'productQuantization',
        note: 'One states what a pass costs at a given width; the other shortens what has to be kept and read before any pass begins.',
      },
      {
        concept: 'growthOutpaces',
        note: 'One takes a cost already written down and asks which of its terms survives; this holds a product of two factors and moves one of them to find out which carries the growth.',
      },
      {
        concept: 'linearSearch',
        note: 'Both walk a whole collection, but one may stop the instant a value matches, while this has no such exit because the answer is an ordering and an ordering needs every score.',
      },
    ],
  },
};

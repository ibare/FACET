/**
 * compareWithAll 개념 선언.
 *
 * canonical facet 은 `facet:compareWithAll` — 조각(piece)이다. 왼쪽에서 바늘이
 * 호 위의 후보 여덟을 하나씩 짚고, 짚을 때마다 곱셈 알갱이가 날아가 오른쪽에
 * 한 줄씩 쌓인다. 쌓인 것이 기둥으로 굳은 뒤 수를 키우면 자가 물러서고, 마지막
 * 줄에서는 물러서지 못해 기둥이 화면 밖으로 잘려 나간다. 계기도 코드 패널도 없고
 * 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `exhaustiveSearch` 는 두 인수 중 어느 쪽이 값을 끌어올리는지를 맡는다.
 * 이 조각이 홀로 맡는 것은 **하나도 건너뛰지 않는 절차와 거기 붙는 청구서** 다 —
 * 견줌의 횟수가 아니라 견줌 안쪽의 곱셈이 값이고, 그 값이 사람이 그릴 수 있는
 * 범위를 벗어난다는 것. definition 의 주어가 "빠짐없이 도는 조회" 이고,
 * keywords 는 무색인 · 정확함 · 셀 수 없어짐 어휘만 갖는다.
 *
 * ── 묶음 사이는 어떻게 갈랐나
 *
 * 무엇으로 재는가(각 · 방향 · 잣대)와 얼마나 줄여 두고 재는가(토막 · 번호 ·
 * 바이트)의 어휘를 definition 과 keywords 에서 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const compareWithAllConcept: FacetConceptSource = {
  id: 'compareWithAll',
  label: 'Compare With All (The Bill for Skipping Nobody)',
  canonicalFacet: 'facet:compareWithAll',

  surface: {
    definition:
      'The exact answer obtained by visiting every stored vector in turn, where each visit adds one multiplication per component, so the bill is the count of vectors multiplied by their components.',
    exemplarKeywords: [
      'brute force nearest neighbour',
      'no index at all',
      'exact but it does not scale',
      'check every stored item',
      'one thousand documents',
      'how many multiplications does one query take',
      'start with the naive method',
      'counting comparisons understates the work',
      'the obvious approach stops working',
      'what an approximate method is buying',
    ],
  },

  briefing: {
    observable: [
      'A needle turns round an arc and lands on each candidate in order, none jumped over, so skipping nobody is a movement rather than a claim.',
      'Each visit sends four beads flying along an arc into a column and they settle as a row of four, so the small total of thirty-two is assembled from things that can be counted by eye.',
      'The loose beads then fuse into a single block, and from that beat on the screen speaks only in height — which is what makes the later numbers impossible to recount.',
      'When the block would pass the ceiling the scale is re-measured rather than folded: earlier totals stay as faint gridlines and sink with it, so the thirty-two we counted becomes a hairline at the floor.',
      'The retreat has an end. At a thousand vectors of 768 components the previous total of 8,192 would be crushed under three pixels, so the scale holds, the column is cut off with a sawtooth in the alert colour, and only the number is left standing.',
      'As the counts climb the individual candidates dissolve into a continuous band on the arc, so the moment they stop being countable is shown on the same screen as the moment the totals stop being countable.',
      'Gridline labels that would collide are hidden instead of nudged apart, so the earliest totals end up unreadable against the floor rather than being drawn somewhere they are not.',
      'The five steps read 32, 128, 2,048, 8,192 and 768,000, and the first four are reachable by the eye while the last is only a numeral.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence on its own and stops on the step that runs off the top.',
        'A Replay button and a playback strip sit underneath. Once the run has finished, dragging the strip back is how a reader can sit on the beat where the scale first retreats.',
        'The five pairs of quantities are fixed and every total is computed from them, so an article can quote any of the five and the reader will meet it.',
      ],
    },

    useWhen: [
      'The article introduces search over embeddings by saying one simply compares the query with everything, and the reader accepts that as a plan rather than a baseline with a price.',
      'Someone has counted the comparisons, found the number equal to the collection size, and concluded the work is modest. The bill is one level below that count and this is where it becomes visible.',
      'The prose is about to argue for an approximate method and needs the figure being traded away to have been felt first, including the point where it leaves the picture entirely.',
    ],

    avoidWhen: [
      'The subject is which quantity two vectors are scored on. Every visit here is charged the same way and the quantity is never named.',
      'The article is about avoiding the visits — an index, a proximity graph, clustering into cells, or coarsened stand-ins for the vectors.',
      'The search in the article runs over an ordered collection, or may stop as soon as it has what it wants.',
      'The variable in the article is the width of a single vector, held against a fixed collection size. Both quantities move together here.',
      'The point is measured running time, hardware or parallelism. Everything on screen is a product of two declared quantities.',
    ],

    contrastWith: [
      {
        concept: 'exhaustiveSearch',
        note: 'One holds the collection size still and moves only the width, isolating which factor is responsible; this keeps both and follows the total until it outruns what a picture can hold.',
      },
      {
        concept: 'scanUntilFound',
        note: 'Both are walks that cannot be cut short, but one cannot stop because absence is only established at the end, while this cannot stop because no candidate can be placed until all of them carry a score.',
      },
      {
        concept: 'knn',
        note: 'Both touch every stored example to answer one question, but there the touching is in the service of a verdict about a label, while here the bill for the touching is itself the subject.',
      },
    ],
  },
};

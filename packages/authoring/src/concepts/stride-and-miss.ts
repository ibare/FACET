/**
 * strideAndMiss 개념 선언.
 *
 * canonical facet 은 `facet:strideAndMiss` — int 열여섯 칸, 줄 하나 = 원소 넷(16 B).
 * 보폭 1 · 2 · 4 로 각각 원소 넷을 읽는다. 보폭마다 빈 캐시에서 시작하고 캐시는 넉넉해
 * 밀어내기가 없다. 쓴 것은 늘 16 B 이고, 올라온 것은 16 · 32 · 64 B — 쓴 비율
 * 100 · 50 · 25 %.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * **어휘 배타**로 갈랐다. 이 개념은 `stride` · `bytes` · `transferred` · `used share` 를
 * 갖고, 형제의 `row` · `column` · `matrix` · `sum` · `loop` · `evicted` 를 definition
 * 에서 쓰지 않는다. 화면이 정말로 그것을 그리지 않는다 — 일차원 배열이고 밀려나는 줄이
 * 없다. 주어도 다르다: 형제들은 미스의 **수**를, 이쪽은 가져온 것 가운데 **버린 몫**을
 * 센다.
 *
 * ── 이웃과
 *
 *   lineFill        줄이 통째로 온다는 규칙 자체. 이쪽은 그것을 전제로 보폭을 바꿔 버린
 *                   몫을 잰다.
 *   cacheLine       보폭을 묶고 줄 폭을 바꾼다. 이쪽은 줄 폭을 묶고 보폭을 바꾼다 —
 *                   마주 보는 짝. 저쪽 keywords 의 `stride and cache line` 을 되풀이하지
 *                   않았다.
 *   spatialLocality 보폭 1 의 좋은 경우. 이쪽은 보폭이 늘 때 그 이득이 줄어드는 쪽.
 *   structAlignment 메모리에 **자리만 차지하는** 빈 바이트, 이쪽은 **옮겨졌지만 안 쓰인**
 *                   바이트.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const strideAndMissConcept: FacetConceptSource = {
  id: 'strideAndMiss',
  label: 'Strided Access (Bytes Fetched but Never Used)',
  canonicalFacet: 'facet:strideAndMiss',

  surface: {
    definition:
      'Taking equally many elements at a growing stride: each on an unfetched line hauls the whole line up, so the used share of transferred bytes falls to a quarter.',
    exemplarKeywords: [
      'strided access',
      'access stride',
      'every other element',
      'every fourth element',
      'skipping through an array',
      'wasted memory bandwidth',
      'bytes fetched versus bytes used',
      'useful fraction of a fetch',
      'reading one field of every record',
      'sparse reads through a buffer',
      'stride as long as a line',
    ],
  },

  briefing: {
    observable: [
      'Memory is drawn as a row of sixteen int cells grouped into four lines of four, with the cache above it. The cursor jumps by the current stride: 0 1 2 3, then 0 2 4 6, then 0 4 8 12.',
      'A read whose line is not up yet copies that whole line into the cache — the original stays in memory — and only the cell actually read lights up; a read whose line is already up brings nothing new.',
      'When a stride finishes, its cache cells drop into a ledger row below and split into used and thrown away, and the ledger keeps all three strides to the end so the thrown-away lengths can be compared.',
      'Each ledger row ends in a tally of used over loaded bytes: 16 / 16 B at stride 1, 16 / 32 B at stride 2, 16 / 64 B at stride 4.',
      'The settling caption names the stride and gives bytes that came up, bytes used and bytes thrown away. The used amount never changes; only what comes up with it does.',
    ],

    screen: {
      affordances: [
        'The screen plays the three strides in order on its own and stops with all three ledger rows showing.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, dragging the strip handle back is how a reader can stop on a single read and see whether its line had already come up.',
        'The sixteen elements, four to a line at four bytes each, the strides 1, 2 and 4 and the four reads per stride are fixed, so an article can quote 16, 32 and 64 bytes.',
      ],
    },

    useWhen: [
      'The article says reading every k-th element is slower than it looks and the reader counts reads, which are the same four each time. The ledger moves the cost to the bytes that came along and were discarded.',
      'The prose needs to show the point at which the stride reaches the line length and every read costs a fresh line for a single element.',
      'The reader is about to see why picking one field out of each record in an array wastes bandwidth, and first needs the simpler version: the same count of reads, spread further apart.',
    ],

    avoidWhen: [
      'The subject is a two-dimensional array and the order of its loops. The memory here is one flat run of elements.',
      'The article is about lines being pushed out of a full cache. The cache here never fills and nothing is evicted.',
      'The point is choosing the width of a cache line. The width is fixed and only the stride varies.',
      'The article uses "stride" for tensor strides or array views, where the question is layout metadata rather than which bytes cross from memory.',
      'The subject is a hardware prefetcher detecting a constant stride. No prediction or early fetch happens here.',
    ],

    contrastWith: [
      {
        concept: 'lineFill',
        note: 'That concept is the rule that one request brings a whole block; this one holds the rule fixed and measures, stride by stride, how much of each block the reads ever touch.',
      },
      {
        concept: 'cacheLine',
        note: 'Mirror claims about one bargain: that concept says a wider block pays off only for accesses that reach its neighbours, this one says a wider gap between accesses leaves more of each block unread.',
      },
      {
        concept: 'spatialLocality',
        note: 'That is the favourable case, a step of one where every fetched neighbour is used; this is the same arrangement as the step grows and the neighbours are fetched for nothing.',
      },
      {
        concept: 'rowVsColumnWalk',
        note: 'That concept charges a poor loop order in data loaded a second time; this one charges a wide gap in data loaded once and never read.',
      },
      {
        concept: 'arrayTraversalOrder',
        note: 'That concept asks whether skipped neighbours survive until a later pass returns for them; here no pass returns, so every skipped byte is simply lost.',
      },
      {
        concept: 'structAlignment',
        note: 'Two kinds of unused bytes: there they sit in memory as padding and are carried wherever the record goes, here they are real data dragged across by a fetch that wanted only one element.',
      },
    ],
  },
};

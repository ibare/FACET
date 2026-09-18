/**
 * rowVsColumnWalk 개념 선언.
 *
 * canonical facet 은 `facet:rowVsColumnWalk` — 4×4 int 배열(행 우선 배치, 캐시 줄 = 한
 * 행, 캐시 두 줄 · 완전 연관 · LRU)을 먼저 행으로, 다음에 열로 더하는 화면이다. 걸음
 * 하나가 바깥 루프 한 바퀴다. 합은 둘 다 136, 미스는 행 넷 · 열 열여섯.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 arrayTraversalOrder 와 가장 붙는다 — 같은 행·열 순회다. **마주 보는 짝**으로
 * 갈랐다.
 *
 *   이 개념             크기를 묶어 두고 순서만 바꾼다. 판정은 "합은 같고 미스는 다르다".
 *                       definition 이 `summing` · `totals agree` · `for-loops swapped` ·
 *                       `reloads` 를 갖는다.
 *   arrayTraversalOrder 순서의 값이 크기에 달렸다고 말한다. `outnumber` · `evicted` ·
 *                       `every access misses` 를 갖는다.
 *
 * 이쪽 definition 에 `cache` · `miss` · `line` 을 쓰지 않았다 — 앞 둘은 완제품이, 뒤는
 * strideAndMiss 가 갖는다. 대신 "첫 읽기가 가져온 것을 다시 쓴다 / 매번 다시 불러온다"
 * 로 말한다.
 *
 * ── 이웃 spatialLocality 와
 *
 * 저쪽 주어는 프로그램의 **버릇** 하나(옆자리로 나아가기)이고, 이쪽은 **같은 데이터를
 * 두 번** 더해 견주는 실험이다. 저쪽 keywords 에 있던 행 우선 대 열 우선 · 잘못된 순서의
 * 이중 루프 두 줄은 이 배치에서 빠져, 루프 순서 어휘는 이 묶음이 갖는다. keywords 는
 * 코드 모양(`a[i][j]` 대 `a[j][i]`, for 두 줄의 맞바꿈)으로 채웠다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rowVsColumnWalkConcept: FacetConceptSource = {
  id: 'rowVsColumnWalk',
  label: 'Row Walk vs Column Walk (Same Sum, Swapped Loops)',
  canonicalFacet: 'facet:rowVsColumnWalk',

  surface: {
    definition:
      'Summing a matrix with its for-loops swapped: totals agree, but a row walk reuses what its first read brought in, while a column walk reloads on every read.',
    exemplarKeywords: [
      'swapping the inner and outer loop',
      'a[i][j] versus a[j][i]',
      'for i then for j',
      'iterate by rows or by columns',
      'same result, different speed',
      'why is my double loop slow',
      'summing a 2D array',
      'row walk',
      'column walk',
      'loop order changes nothing but time',
      'hits and misses counted per walk',
    ],
  },

  briefing: {
    observable: [
      'Two panels stand side by side over the same 4×4 array holding 1 to 16: the row walk on the left, the column walk on the right, each with its own two-slot cache under the array. Each row of the array is exactly one line.',
      'The row walk runs first, one row per step. Its cursor slides sideways inside a row, the first read misses and brings that row down into a cache slot, and the other three reads are hits.',
      'Then the column walk runs, one column per step. Its cursor arcs from row to row, every read misses, and after the two slots are full each new row pushes an older one out sideways — the row it will need again at the start of the next column.',
      'Cells stay coloured by how they were reached, hit or miss, so the finished panels are themselves the tally: twelve hits and four misses on the left, sixteen misses on the right.',
      'Each step\'s caption names the row or column and gives its misses, lines pushed out and hits; the final caption reads that both sums are 136 and the misses are 4 against 16.',
    ],

    screen: {
      affordances: [
        'The screen plays both walks on its own, the row walk and then the column walk, and stops on the final comparison.',
        'Under it sit a Replay button and a playback strip. Once both walks have finished, dragging the strip handle back is how a reader can stop on a single column step and watch its four misses and two push-outs.',
        'The values, the one-row-per-line layout and the two-line cache are fixed, so an article can quote the sum of 136 and the counts 4 and 16.',
      ],
    },

    useWhen: [
      'The article shows two versions of a nested loop that differ only in which index is outside and claims one is faster. The reader has to see that nothing about the arithmetic changed — the sums match — and that the difference lives entirely in reloading.',
      'The prose needs the reader to follow one column step read by read: four jumps, four reloads, and the row just loaded being pushed out before it is used a second time.',
    ],

    avoidWhen: [
      'The article is about how large the array must be before loop order matters. The size here is fixed, and it is already larger than the cache.',
      'The subject is a single walk in address order and where its misses fall. Here two walks are compared against each other.',
      'The article is about skipping elements with a fixed step through a one-dimensional array, or about how many bytes each fetch wastes.',
      'The point is matrix multiplication, transposition, or loop tiling. Only a plain sum is performed.',
      'The numbers are being presented as timings. The screen counts hits and misses; it does not measure time.',
    ],

    contrastWith: [
      {
        concept: 'arrayTraversalOrder',
        note: 'This claims that swapping the loops changes the reloads and never the result; that concept claims the change is conditional, costing nothing until the rows outnumber what the cache retains.',
      },
      {
        concept: 'spatialLocality',
        note: 'That is one habit of a single program — going on to the next address; this is a comparison of two programs that compute the same thing, one with the habit and one without.',
      },
      {
        concept: 'strideAndMiss',
        note: 'Going down a column is one kind of skipping read: this concept charges it in blocks loaded a second time, that one charges skipping in bytes that arrive once and are never read.',
      },
      {
        concept: 'lineFill',
        note: 'That is the rule that one request brings a whole block; this is the consequence for two loop orders — one uses every block it brings, the other brings a block for each value.',
      },
      {
        concept: 'fetchAhead',
        note: 'Fetching ahead makes the next block arrive before it is needed; this concept is about whether the order of reads needs the next block at all.',
      },
    ],
  },
};

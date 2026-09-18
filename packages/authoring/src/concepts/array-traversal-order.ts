/**
 * arrayTraversalOrder 개념 선언.
 *
 * canonical facet 은 `facet:arrayTraversalOrder` — 행 우선으로 저장된 R×8 int 배열을
 * 행 우선 또는 열 우선으로 걸으며 더하는 완결형이다. 캐시는 완전 연관 · LRU · 여덟 줄 ·
 * 줄 하나에 원소 넷이고 판마다 빈 채로 시작한다. 순서(행 우선 · 열 우선)와 행 수
 * (4 · 8 · 12 · 16) 두 손잡이를 돌린다. 행 우선은 어느 행 수에서나 25 %, 열 우선은
 * 8 행까지 25 % 이다가 12 행부터 100 % 가 된다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 *   이 개념          주어가 **행 수와 캐시 줄 수의 관계**다. 순서가 값을 치르는지는
 *                    크기가 정한다 — 문턱을 넘기 전에는 공짜, 넘으면 전부 미스.
 *                    `outnumber` · `evicted` · `comes back` 을 갖는다.
 *   rowVsColumnWalk  주어가 **두 for 의 맞바꿈** 한 번이다. 크기를 고정하고 순서만 바꿔
 *                    합은 같고 미스는 다르다는 판정 하나. `totals agree` · `reloads` 를
 *                    갖는다. 이쪽 definition 에는 합(sum/total)을 쓰지 않았고, 저쪽에는
 *                    크기·문턱 어휘가 없다 — 마주 보는 짝이다(저쪽은 크기를 묶고 순서를
 *                    바꾸고, 이쪽은 순서의 값이 크기에 달렸다고 말한다).
 *   strideAndMiss    주어가 **올라온 바이트 가운데 쓴 몫**이다. 행·열·배열 어휘를 저쪽은
 *                    쓰지 않고, 이쪽은 `stride` · `bytes` 를 쓰지 않는다.
 *
 * 조각의 대표 낱말(`swap the loops`, `stride`)을 이쪽 keywords 로 몰아오지 않았다.
 *
 * ── 이웃과
 *
 * directMappedCache 가 `fits` · `outgrows` · `miss rate` · `cliff` 를 definition 에서
 * 이미 갖고 있어 여기서는 쓰지 않는다. 저쪽은 한 순서로 되풀이 훑는 배열이 자리 겹침
 * 으로 무너지는 곡선이고, 이쪽은 한 번 훑는데 순서 하나만 무너진다. 행 우선 막대가
 * 끝까지 평평한 것이 이쪽의 변별이다.
 *
 * spatialLocality 는 차례대로 훑는 한 걸음의 이득이고, 이쪽은 열 우선의 손해가 언제
 * 생기느냐다 — 열 우선의 25 % 는 사실 다음 열이 같은 줄로 **돌아오는** 되쓰기라
 * temporalLocality 쪽에 더 가깝다. 행·열 순회 어휘는 이 묶음이 갖는다 (spatialLocality
 * keywords 에 있던 행 우선 대 열 우선 · 잘못된 순서의 이중 루프 두 줄은 이 배치에서
 * 빠졌다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const arrayTraversalOrderConcept: FacetConceptSource = {
  id: 'arrayTraversalOrder',
  label: 'Array Traversal Order (When Loop Order Starts to Cost)',
  canonicalFacet: 'facet:arrayTraversalOrder',

  surface: {
    definition:
      "Column-major traversal of a row-major array costs nothing extra until its rows outnumber the cache's lines; then each line is evicted before the next column returns and every access misses.",
    exemplarKeywords: [
      'loop interchange',
      'when does loop order matter',
      'matrix too tall for the cache',
      'column-major access in C',
      'Fortran order versus C order',
      'numpy order C versus F',
      'iterating a 2D array the slow way',
      'large matrix traversal performance',
      'evicted before it is reused',
      'miss percentage per row count',
      'LRU cache and nested loops',
      'performance falls off at a size threshold',
    ],
  },

  briefing: {
    observable: [
      'The array is drawn stored row by row, eight elements wide, each row outlined as two lines of four; a cursor moves over it and leaves a short trail, sliding one cell sideways in row-major order and dropping a whole row per step in column-major order.',
      'Beside it the cache stands as a column of eight tiles with the most recently used line on top. A missed line flies from its place in the array to the top tile and the rest shift down one; the line that falls off the bottom drops into a "pushed out" spot and disappears.',
      'The outlines on the array record each line\'s state — resident, pushed out, or not yet fetched — so the reader can see which lines a column is about to need and whether they are still there.',
      'At twelve or sixteen rows in column-major order the caption reports "miss again — it was pushed out before the walk came back": the line was fetched for the previous column and lost before the next one reached it.',
      'A bar chart of miss rate by row count keeps a bar for each order at 4, 8, 12 and 16 rows. The row-major bars stand level at 25% across all four; the column-major bars match them at 4 and 8 and jump to 100% at 12 and 16, with a marker between 8 and 12 labelled "rows > cache lines".',
      'Four counters run with each pass — accesses, misses, miss percentage and the running sum — and the sum ends on the same value in both orders, printed beside the chart legend for each.',
      'Each access plays as three highlighted steps in the code: the addition in walkSum, then the address and lookup in countMisses, then the hit or miss branch.',
    ],

    screen: {
      affordances: [
        'Playback controls sit under the canvas: play, single step, pause, reset and a speed slider.',
        'A traversal order control switches between Row-major and Column-major; it starts on Column-major.',
        'A row count control offers 4, 8, 12 and 16 rows and starts at 12. Moving either control during a pass abandons it and starts a fresh pass from an empty cache under the new setting.',
        'Bars already measured stay on the chart when the controls move, so the reader can fill in all eight bars and compare them without replaying.',
        'The width of eight elements, four elements to a line and eight lines of cache are fixed, so an article can state the exact row count at which the column-major penalty appears.',
        'The code panel titled "Walk and miss count" starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article recommends putting the row loop outside and the reader has benchmarked a small matrix and seen no difference. The screen shows that at 4 and 8 rows there really is none, and where the difference begins.',
      'The prose has to explain why the column-order penalty is all-or-nothing rather than gradual: a line fetched for one column either survives until the next column or is gone, and which one happens is decided by the row count against the cache lines.',
      'The reader needs to see that the penalty belongs to the pairing of order and size, not to either alone — the same column-major loop is harmless on one array and the worst case on a slightly taller one.',
    ],

    avoidWhen: [
      'The array is laid out column by column, as in Fortran or a column-major matrix library. Here the storage is always row by row, so the favoured order is fixed.',
      'The subject is conflicts from address mapping, set indexing, or cache associativity. The cache here is fully associative and only its capacity is in play.',
      'The article is about prefetchers, vectorisation, or blocking a matrix into tiles. None of them is present; the only remedies on offer are changing the order or the size.',
      'The percentages are being quoted as measurements of a real processor. They are counts from a small simulated cache with no prefetching.',
      'The point is only that a cache fetches a whole line when one element is asked for. That is assumed here and is not the claim.',
    ],

    contrastWith: [
      {
        concept: 'rowVsColumnWalk',
        note: 'That concept claims swapping the loops alters the misses but never the result; this one claims the alteration is conditional — zero until the rows outnumber the cache\'s lines, total after.',
      },
      {
        concept: 'strideAndMiss',
        note: 'Both concern reads that skip over neighbours, but that one counts the bytes a skipping read brings and never uses, while this one asks whether the skipped neighbours are still resident when the traversal finally comes back for them.',
      },
      {
        concept: 'directMappedCache',
        note: 'Both claim a sharp turn once the data exceeds the cache, but there the cause is addresses forced into the same slot, while here it is an access order that postpones reuse past what the cache retains.',
      },
      {
        concept: 'temporalLocality',
        note: 'The column-major order only wins when it returns to a line fetched one column earlier; this concept is the case where that return is a reuse, and the size at which it stops being one.',
      },
      {
        concept: 'spatialLocality',
        note: 'That is the gain from going on to the next address; this is what an order that does not go on to the next address has to rely on instead, and when that reliance fails.',
      },
      {
        concept: 'prefetching',
        note: 'Prefetching hides a miss by asking for a line early; this concept removes misses by choosing an order, and assumes no line ever arrives before it is asked for.',
      },
    ],
  },
};

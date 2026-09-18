/**
 * spatialLocality 개념 선언.
 *
 * canonical facet 은 `facet:spatialLocality` — a[0] 부터 a[7] 까지 차례로 짚는
 * 조각. 여덟 번 짚는 동안 아래층까지 내려가는 것은 줄이 바뀌는 경계 두 곳뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (특히 lineFill 과)
 *
 * 이 둘이 가장 붙는다. 갈라 세운 것은 **주어**다.
 *
 *   lineFill   주어가 **캐시**다. 미스가 나면 블록을 통째로 베껴 올린다 — 코드가
 *              어떻게 쓰였든 하는 일이다.
 *   이 개념    주어가 **프로그램**이다. 방금 쓴 자리의 옆자리를 이어서 쓰는 버릇이고,
 *              그 버릇이 있어야 위의 베껴 올림이 비로소 이득이 된다. definition 이
 *              "a program's tendency" 로 시작해 경계 규칙으로 끝나는 까닭이다.
 *
 * 형제 temporalLocality 와는 **방향**으로 갈랐다 — 저쪽은 같은 자리로 되돌아오는
 * 것이고 이쪽은 옆자리로 나아가는 것이다. 여기서는 같은 원소를 두 번 짚지 않는다.
 *
 * 그래서 keywords 는 순회 어휘(순서대로 훑기 · 행 우선 · 보폭 1 · 배열 대 연결
 * 리스트)를 갖고, 전달 어휘는 lineFill 에, 되풀이 어휘는 temporalLocality 에 넘긴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const spatialLocalityConcept: FacetConceptSource = {
  id: 'spatialLocality',
  label: 'Spatial Locality (Going On to the Next Address)',
  canonicalFacet: 'facet:spatialLocality',

  surface: {
    definition:
      'A program\'s tendency to touch addresses adjacent to one it has just used, so that a walk taken in address order pays for a trip to memory only where it crosses a block boundary.',
    exemplarKeywords: [
      'spatial locality',
      'sequential access',
      'walking an array in order',
      'stride-one access',
      'why array traversal beats pointer chasing',
      'contiguous memory',
      'iterating a list of records front to back',
      'the next element is already there',
      'misses only at the boundary',
    ],
  },

  briefing: {
    observable: [
      'The cursor\'s motion is almost entirely sideways: across the whole run only two movements are vertical, and the ratio between the sliding and the descending is the claim the screen is making.',
      'A dashed divider stands between the two groups of four, and the two descents happen there and nowhere else, so the misses are seen to be placed rather than merely counted.',
      'A miss arrives in two beats — the cursor first stops on an empty slot upstairs and reports that nothing is there, and only then does the line rise — so the reader meets the problem before the remedy.',
      'The four cells of a line rise as one group, and dashed outlines stay behind below to show the originals were not taken away.',
      'Each cell carries its byte address beneath it and its line name below that, so the boundary is recomputable rather than asserted: address 12 divides into line 0 and address 16 into line 1, which is exactly where the second descent happens.',
      'Cells finish in different colours according to how they were reached, so the final still image is itself the tally — the ones that rode along against the two that went down.',
      'The closing caption puts the three counts in one line: eight touched, six rode along, two went down.',
      'Captions during the run name the index, its address and its line, so a reader moving along the playback strip can do the division at each cell.',
    ],

    screen: {
      affordances: [
        'The screen walks all eight accesses and the closing tally on its own and then stops.',
        'Under it sit a Replay button and a playback strip. Once the walk has finished, dragging the strip handle back is how a reader can stop on the boundary between a[3] and a[4] where the division changes.',
        'The eight indices and the proportion of four elements to a line are fixed, so an article can name the crossing and quote the addresses on either side of it.',
      ],
    },

    useWhen: [
      'The article says walking an array in order is fast and the reader hears something about instruction count. Two descents for eight reads, both at boundaries, relocates the saving into the memory system.',
      'The reader should see that the misses are not distributed among the accesses but pinned to the places where the address divides differently — the position of a miss is predictable, not statistical.',
      'The prose compares two ways of arranging or traversing the same data and needs adjacency in addresses, rather than adjacency in the program\'s logic, to be the thing that pays.',
      'The reader has accepted that a block arrives whole and now needs the other half of the bargain: that the arriving block is only a saving if the code goes on to touch the rest of it.',
    ],

    avoidWhen: [
      'The subject is coming back to an address used earlier. Every access here is to a new element, and nothing is read twice.',
      'The point is the fetch itself — that naming one element brings its neighbours up. That transfer is taken as given here; what is on display is the order in which a program then touches them.',
      'The article is about choosing how wide a block should be. The width is fixed here and the walk is the only variable.',
      'The subject is what a cache discards when it runs out of room. Both lines stay resident here, so no room ever runs out.',
      'The article is about a walk that is deliberately scattered or strided, and the misses it suffers. This shows the favourable case: a walk in order over an array whose start coincides with a boundary.',
      'The subject is alignment — a record straddling two blocks, or the padding used to prevent it.',
      'The article is about the several levels of a memory hierarchy and their differing costs. One tier is drawn here.',
      'The subject is an HTTP cache, a CDN, or a memoized function.',
      'The article uses "locality" in its ordinary sense of place or neighbourhood, or for locality in a distributed system.',
    ],

    contrastWith: [
      {
        concept: 'lineFill',
        note: 'The program\'s side and the machine\'s side of one bargain: that one is the cache copying a whole block for a single request, which it does however the code is written, while this one is code that goes on to touch the rest of the block, which is what turns the copying into a saving.',
      },
      {
        concept: 'temporalLocality',
        note: 'Both explain why a later access can be free, but one is a return to an address already fetched and the other is an arrival at the address next door; a program can have either without the other.',
      },
      {
        concept: 'cacheLine',
        note: 'This holds the width fixed and asks what a walk in order gets out of it; that one holds the walk fixed and asks how wide the block should have been.',
      },
      {
        concept: 'latencyLadder',
        note: 'This is about how many descents a walk makes; that one is about the price of one descent, which is what makes the count worth reducing.',
      },
    ],
  },
};

/**
 * lineFill 개념 선언.
 *
 * canonical facet 은 `facet:lineFill` — 두 층짜리 조각. a[1] · a[5] · a[9] 를
 * 차례로 부르는데 셋이 각각 다른 줄에 있어, 부른 것은 셋이고 올라온 것은 열둘이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (특히 spatialLocality 와)
 *
 * 이 둘이 가장 붙는다. 갈라 세운 것은 **주어**다.
 *
 *   이 개념          주어가 **캐시**다. 미스가 나면 블록을 통째로 베껴 올린다 —
 *                    코드가 어떻게 쓰였든 하는 일이고, 딸려 온 것이 쓰일지 아닐지는
 *                    이 개념이 말하지 않는다. 그래서 definition 이 "whether or not
 *                    the extra ones are ever read" 로 끝난다.
 *   spatialLocality  주어가 **프로그램**이다. 딸려 온 이웃을 이어서 짚는 버릇이고,
 *                    그 버릇이 있어야 위의 베껴 올림이 이득이 된다.
 *
 * 하나는 기계가 하는 일이고 하나는 코드가 가진 성질이다. 그래서 여기 keywords 는
 * 전달 어휘(블록이 올라온다 · 복제본 · 부른 것보다 많이 온다)를 갖고, 순회 어휘
 * (순서대로 훑기 · 행 우선 · 보폭 1)는 전부 spatialLocality 에 넘긴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lineFillConcept: FacetConceptSource = {
  id: 'lineFill',
  label: 'Line Fill (One Request, a Whole Block)',
  canonicalFacet: 'facet:lineFill',

  surface: {
    definition:
      'What a cache does on a miss: it copies the entire fixed-size block holding the requested element, so several elements arrive in answer to one request whether or not the extra ones are ever read.',
    exemplarKeywords: [
      'cache line fill',
      'the whole block is fetched',
      'asking for one byte brings its neighbours',
      'the unit of transfer is not the unit of the request',
      'memory moves in blocks, not bytes',
      'reading one field pulls in the rest of the record',
      'the cache holds a copy, memory keeps the original',
      'three asked for, twelve arrived',
      'which line an address belongs to',
      'address divided by line size',
      'granularity of a memory transfer',
    ],
  },

  briefing: {
    observable: [
      'Two floors stand from the start: cells laid out below as memory, and empty dashed frames above waiting to be filled, each frame already labelled with the byte range it will hold — 0 to 15, 16 to 31, 32 to 47.',
      'Naming a cell drops a marker onto that one cell and lights it alone, so the size of the request is on screen before the size of the answer is.',
      'The four cells of a line then travel upward as a single group rather than one after another, which is what makes the transfer read as one movement instead of four.',
      'Only after the group lands do the three nobody asked for turn to dashed outlines — the distinction between what was requested and what came along is drawn after arrival, not before.',
      'The lower floor keeps its cells throughout; what rises is a duplicate, so the screen says copied rather than moved without a word.',
      'Every cell carries both its index and its byte address, so which line a cell belongs to can be worked out by dividing rather than taken on trust — a[1] at address 4 falls in line 0, a[5] at 20 in line 1, a[9] at 36 in line 2.',
      'The three requests are deliberately in three different lines, so each one triggers its own rise and the mismatch accumulates three times over.',
      'A tally at the end states the two counts against each other: cells named, three; cells arrived, twelve.',
    ],

    screen: {
      affordances: [
        'The screen plays the three requests and the closing tally on its own and then stops.',
        'Under it sit a Replay button and a playback strip. Once the tally is up, dragging the handle back is how a reader can hold the moment between a cell being named and the line arriving.',
        'The three requested indices and the proportion of four elements to a line are fixed, so an article can name a specific request and quote the byte range that comes with it.',
      ],
    },

    useWhen: [
      'The reader assumes a load fetches exactly what was named. The closing count — three named, twelve arrived — is the whole correction, and it wants the moment between the one lighting up and the four landing.',
      'The prose is about to talk about layout, padding, or the cost of touching one field of a record, and needs the unit of transfer established as something larger than the unit of the request before any of that can mean anything.',
      'The reader pictures the cache as taking the value out of memory, so that a value is either up or down but never both. The originals staying put while a copy rises is the thing to point at.',
      'The article is about to divide an address by a block size and wants line membership to arrive as a computation the reader can redo, not a label they must accept.',
    ],

    avoidWhen: [
      'The subject is whether the neighbours that arrived are any use. This screen shows them arriving and takes no position on whether the program goes on to read them; that depends on how the code walks memory.',
      'The point is how wide a line should be. The width is fixed here and never moves, so there is no trade-off on display.',
      'The subject is an HTTP cache, a CDN, or a browser cache — copies of documents placed across machines rather than a block of addresses moving between two floors.',
      'The article is about memoizing a function or caching a computed result under a key.',
      'The subject is a bounded cache that must discard an entry to make room — LRU, eviction, capacity. Each line here settles into its own empty frame.',
      'The point is which frame a line lands in, or how an address splits into a tag and an index. Placement is not the argument here.',
      'The article is about a page being brought in from disk, or about virtual memory. The shape is the same — a whole block arrives for one request — but the level and cost are different.',
      'The subject is fetching a block before it is demanded. The line here rises because it was named.',
      'The article uses "line" for a line of source code or a line of text.',
    ],

    contrastWith: [
      {
        concept: 'spatialLocality',
        note: 'The machine\'s side and the program\'s side of one bargain: this is the cache copying a whole block for a single request, which it does however the code is written, while that one is code that goes on to touch the rest of the block, which is what turns the copying into a saving.',
      },
      {
        concept: 'cacheLine',
        note: 'That one treats the block\'s width as a quantity to be chosen and weighs what the choice costs; this one only asserts that the block exists and that asking for one element brings the rest of it.',
      },
      {
        concept: 'temporalLocality',
        note: 'Two different second chances: here the saving would come from a neighbour that rode along uninvited, there from the same address being asked for again before it is displaced.',
      },
      {
        concept: 'latencyLadder',
        note: 'This is what a miss brings back; that one is how far it had to go to get it.',
      },
    ],
  },
};

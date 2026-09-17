/**
 * indexAndTag 개념 선언.
 *
 * canonical facet 은 `facet:indexAndTag` — 주소 다섯(0 · 20 · 64 · 100 · 132)이
 * 차례로 들어와 세 토막으로 끊기고, 토막마다 제 자리로 날아가는 조각. 손잡이는
 * 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 셋이 모두 "주소가 어느 자리에 앉는가" 를 다루므로 definition 의 **층위**를
 * 갈랐다.
 *
 *   이 개념             주소 **하나의 안쪽**. 비트열이 어디서 끊기고 각 토막이
 *                       무슨 일을 맡는가. 결과가 좋은지 나쁜지는 말하지 않는다.
 *   conflictMiss        그 규칙이 만든 한 장면 — 빈 자리를 두고 밀려난다.
 *   directMappedCache   그 규칙이 자료가 커질 때 그리는 곡선.
 *
 * 그래서 여기 definition 은 `miss` · `hit` · `evict` · `empty` · `fits` ·
 * `miss rate` 를 한 번도 쓰지 않는다. 쓰는 순간 세 점이 붙어 검색이 갈리지 않는다.
 * 대신 끊기 · 토막 · 고르기 · 증언하기 · 바이트 어휘만으로 선다. 화면도 히트와
 * 미스를 판정하지 않는다 — 판정은 형제 둘의 몫이다.
 *
 * ── 이 개념만의 오검출
 *
 * `index` 와 `tag` 는 이 분야 밖에서 훨씬 흔한 말이다. 데이터베이스 인덱스 ·
 * 검색 색인 · 배열 첨자 · git index 가 한쪽이고, HTML/XML 태그 · git tag ·
 * 태그 클라우드가 다른 쪽이다. definition 이 아무리 좁아도 낱말이 걸리므로
 * avoidWhen 이 양쪽을 다 밀어낸다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const indexAndTagConcept: FacetConceptSource = {
  id: 'indexAndTag',
  label: 'Index and Tag (One Address Cut Into Three Jobs)',
  canonicalFacet: 'facet:indexAndTag',

  surface: {
    definition:
      'A memory address cut into three fields with separate jobs: the middle bits choose a cache line, the high bits stay in that line to say whose data it holds, and the low bits pick a byte inside it.',
    exemplarKeywords: [
      'index and tag',
      'how an address is split for a cache',
      'tag bits index bits offset bits',
      'which cache line does this address go to',
      'what is a cache tag for',
      'block offset within a line',
      'comparing the tag to decide the answer',
      'how many bits go to the index',
      'the cache geometry decides the field widths',
      'no search is needed to find the line',
      'two addresses with the same index',
      'address breakdown in a cache lookup',
    ],
  },

  briefing: {
    observable: [
      'The address stands at the top as a row of individual bit glyphs joined into one strip, all in a single neutral colour, so it is one object before it is three.',
      'The break is given a step of its own on the first address: the strip parts at two places and the three pieces take three different colours at that moment, so the cut is seen happening rather than presented already made.',
      'The widths are unequal and stay unequal — four glyphs, then two, then four — so the middle field is visibly the smallest of the three.',
      'The three pieces leave for different destinations and leave slightly out of step with one another, so three separate errands can be told apart in one motion.',
      'Each piece docks where it belongs rather than beside a label: the middle field comes to rest outside the box next to one row with an arrow pointing into it, the high field lands inside that row, and the low field stops above the byte ruler.',
      'Colour ties each field to the place it governs — the chosen row is outlined in the middle field\'s colour, the field it occupies is filled in the high field\'s colour, and the byte it marks turns the low field\'s colour.',
      'A dashed line drops from the low field down to the one tick it marks, so its target is inside the row the middle field has already chosen.',
      'The cache is drawn as four numbered rows, each with a dashed empty compartment and a ruler of sixteen byte ticks numbered every fourth, so the four rows and the sixteen bytes are countable before any address arrives.',
      'The high field stays behind in its row after the rest of the address is gone, and the row that holds one is drawn filled while the rows that hold none stay dashed.',
      'Three of the five addresses come to the same row, and when they do the piece already resident slides down and fades before the new one settles, so what is kept is replaced rather than accumulated.',
      'The captions name the numbers as they happen — which row was chosen and which byte is pointed at — and on a replacement they say the row is the same but the place is not.',
      'The closing step rings every row that is still holding a high field, gathering the pieces that stayed behind into one image.',
    ],

    screen: {
      affordances: [
        'The screen plays the five addresses and the closing pulse on its own and then stops.',
        'Two buttons: Replay, and a step control for taking the same sequence one move at a time, which is how a reader can hold the moment between the strip breaking and the pieces arriving.',
        'The cache of four lines, the sixteen bytes to a line and the five addresses are fixed, so an article can name an address and quote the row and the byte it resolves to.',
      ],
    },

    useWhen: [
      'The article says a cache "looks up" an address and the reader pictures a search. Bits arriving already carrying the answer is the correction — the row is read off the address rather than found in it.',
      'The reader has to accept that two different addresses can legitimately arrive at the same row before anything about competition for it will make sense.',
      'The prose needs the stored field to be understood as evidence rather than payload: something is kept in the row for no other reason than to say which of the many addresses that could be there actually is.',
      'The article is about where the field widths come from, and needs them to arrive as consequences of the cache\'s shape — so many bytes to a line, so many lines — rather than as constants to memorise.',
      'The reader should see that one of the three pieces takes no part in choosing a place at all, and only picks out a byte once the place is settled.',
    ],

    avoidWhen: [
      'The subject is a database index, a search engine index, or an inverted index — structures built to speed up queries over records or documents. Nothing is built here; the fields are already present in the address.',
      'The article uses "index" for a position in an array, a loop counter, the staging area of a version control system, or the index of a book.',
      'The article uses "tag" for markup, an element in HTML or XML, a release tag in version control, a label attached to a post or an issue, or metadata stored in a media file.',
      'The subject is a hash function turning a key into a slot number. The fields here are read straight off the address with no computation and no mixing.',
      'The point is that a block is thrown out while other lines are unused, or how two addresses competing for one row hurt a program. The competition is set up here and never scored.',
      'The article is about how a cache behaves as the data grows — where it stops keeping up. One address is followed at a time here and nothing is counted.',
      'The subject is whether a lookup succeeded or failed. This does not rule on outcomes; it shows how the question is asked.',
      'The article is about an HTTP cache, a CDN, or a memoized function keyed by its arguments.',
      'The subject is a bounded cache data structure that discards entries when full, or the rule it uses to choose.',
      'The article is about virtual memory translation — page numbers, page tables, or the TLB. An address is divided there too, and the division does a different job.',
      'The subject is byte order, alignment, or how a value is laid out across bytes.',
    ],

    contrastWith: [
      {
        concept: 'directMappedCache',
        note: 'This is the rule that sends an address to a line and recognises it there; that one takes the rule as given and asks what it costs once more data is in play than the cache can hold at once.',
      },
      {
        concept: 'conflictMiss',
        note: 'Both turn on two addresses arriving at one line, but this only establishes that they legitimately can and how they are told apart, while that one is about what it does to a program when they do.',
      },
      {
        concept: 'cacheLine',
        note: 'The field widths follow from the geometry this settles — how many bytes to a line and how many lines. That one treats the width as a quantity to choose; here it is already chosen and its consequences for the address are read off.',
      },
      {
        concept: 'lineFill',
        note: 'Two things that happen to one address: that one is the block travelling up on a miss, this one is how the address is read to decide which block and which byte were meant.',
      },
    ],
  },
};

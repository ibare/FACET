/**
 * suffixArray 개념 선언.
 *
 * canonical facet 은 `facet:suffixArray` — 완제품이다. 글 열한 자가 자리 번호를 달고
 * 위에 서고, 그 꼬리 열하나가 사전 순으로 줄을 이룬다. 줄과 줄 사이에 이웃 겹침이
 * 적히고, 오른 칸에 찾는 패턴 · 남은 구간 · 덩어리 · 이웃 겹침 평균이 선다. 이분
 * 탐색이 줄 왼쪽 괄호와 가운데를 짚는 삼각으로 그려지고, 닿으면 띠가 이웃한 줄
 * 여럿을 덮는다. 손잡이는 글의 되풀이 정도(1 · 2 · 3 · 4)다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 `allSuffixesSorted` 의 주어는 **미리 만들어 두는 물건**이고, 그 avoidWhen 이
 * "다 된 배열 위에서 찾는 일은 이 화면이 아니다" 라고 못박아 두었다. 이쪽
 * definition 의 주어는 바로 그 **찾는 일** 이다 — 미리 줄 세워 둔 글에서 이분
 * 탐색으로 덩어리를 좁히고 등장 자리 전부를 거기서 읽어 낸다는 것.
 *
 * keywords 도 그 선으로 갈랐다. 조각이 배열의 이름과 성질(suffix array · sorted
 * suffixes · full-text index)을 이미 가졌으므로 이쪽은 **조회 어휘**를 갖는다 —
 * 좁히기 · 범위 · 등장 횟수 세기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const suffixArrayConcept: FacetConceptSource = {
  id: 'suffixArray',
  label: 'Suffix Array (Searching a Text Ordered in Advance)',
  canonicalFacet: 'facet:suffixArray',

  surface: {
    definition:
      'Searching a text whose suffixes were put in dictionary order beforehand, where a binary search narrows to the single run of rows beginning with the pattern and every occurrence is read off that run.',
    exemplarKeywords: [
      'suffix array search',
      'binary search over sorted suffixes',
      'narrowing to the rows that start with the pattern',
      'every occurrence lies in one range',
      'count how many times a substring occurs',
      'locating a substring in a prepared text',
      'lo, hi and mid over rows of suffixes',
      'repetitive text makes neighbours share more',
      'searching a genome or a long log',
      'one preparation answers any pattern afterwards',
    ],
  },

  briefing: {
    observable: [
      'The text stands across the top with a position number over each character, and eleven rows below hold every tail of it, each row carrying the position it was cut from beside its own characters.',
      'Between consecutive rows a number gives how many opening characters that row shares with the row above it, and it is this figure the handle actually moves.',
      'A right-hand panel carries the pattern, three named bounds, the range the block occupies, and the neighbour overlap average as the largest number on screen.',
      'Narrowing is drawn as a bracket down the left of the rows still in play and a triangle beside the row being probed; the rows themselves never rearrange, so the narrowing is entirely a matter of which of them are still bracketed.',
      'Each probe states which side the answer can be on — a row that sorts before the pattern puts the block below it, a row that does not puts the block here or above.',
      'When the search lands, a tinted band is laid behind a run of consecutive rows and the matching rows have exactly their first pattern-length cells picked out, so the block is marked by what its rows begin with rather than by where in the text they came from.',
      'Every matching row is announced with its rank and the position in the text it was cut from, and those ranks are consecutive, which is the adjacency being used rather than asserted.',
      'Pushing the handle keeps the row count at eleven and changes only how alike the rows are: the overlap average runs 0.00, 1.20, 3.00, 4.50 while the block grows from a single row to five.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a four-position slider for how repetitive the text is, at the second position to begin with, each position a different eleven-character text with its own pattern.',
        'All four texts are eleven characters long, so the number of rows never changes and the picture holds still while the handle moves.',
        'Three readouts beside the handle — overlap sum, comparisons, matches — and the array, the overlaps and the block are all computed during the run.',
        'The code panel spells the ordering out as an insertion sort with an explicit character comparison rather than a single sort call, so what the rows were ordered by stays visible beside what is done with them.',
      ],
    },

    useWhen: [
      'The article asserts that occurrences must end up adjacent once the tails are ordered, and a reader accepts the assertion without ever seeing it used. The band closing over consecutive rows, each reporting a different position in the text, is that adjacency doing the work it was claimed for.',
      'A reader has to weigh preparation against querying and needs both halves in view at once. The ordering happens in a single step here and the search that follows touches a handful of rows, so the expensive half and the cheap half appear in the order they are paid.',
      'The prose claims that how repetitive a text is decides how well this index serves it. Four texts of identical length run under one handle while the shared opening between neighbours goes from nothing to four and a half characters and the answer goes from one position to five.',
    ],

    avoidWhen: [
      'The subject is how such an ordering is actually produced — prefix doubling, DC3, SA-IS, or what ordering n tails costs. The rows are put in order in one step here and the code alongside shows the criterion rather than the method used in practice.',
      'The article needs the shared lengths between neighbouring entries as a structure in their own right, or an index compressed from them such as the Burrows-Wheeler transform. Those numbers are printed here but nothing is built on them.',
      'The subject is an index over several separate strings. Every row here is a tail of the same eleven characters.',
      'The article wants a search that reports one occurrence and stops. What is reported here is the whole run of them, and a text holding the pattern once is only the first position of the handle.',
      'The article uses "suffix" for a file extension, a domain suffix, or a word ending in grammar.',
    ],

    contrastWith: [
      {
        concept: 'allSuffixesSorted',
        note: 'The ordering and what is asked of it: that one ends when the tails are in order, while this begins there and claims the ordering answers for a pattern it was never told about.',
      },
      {
        concept: 'binarySearch',
        note: 'The same narrowing over an ordered row, but one looks for a value that is either present or absent, while this looks for the first of a run and keeps reading past it, since the answer wanted is how many and where rather than whether.',
      },
      {
        concept: 'trie',
        note: 'Both make strings that begin alike findable together, but one shares those beginnings as a path built from the words being stored, while this gets the same grouping out of ordering alone and the strings it groups are the tails of one text.',
      },
      {
        concept: 'kmp',
        note: 'Both pay once before any searching, but one prepares the pattern and is spent when that pattern has been found, while this prepares the text and stands for whatever is asked of it afterwards.',
      },
    ],
  },
};

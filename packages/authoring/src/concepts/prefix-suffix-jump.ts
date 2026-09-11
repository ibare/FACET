/**
 * prefixSuffixJump 개념 선언.
 *
 * canonical facet 은 `facet:prefixSuffixJump` — 조각(piece)이다. 화면이 두 층이다.
 * 위층은 패턴이 제 복제를 오른쪽으로 밀며 앞뒤가 겹치는 가장 긴 길이를 찾아 표 칸에
 * 떨어뜨리고, 아래층은 그 표를 받아 텍스트에서 밀 거리를 정한다. 계기도 코드 패널도
 * 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 `naiveShiftByOne` 과 문제·답 관계라 definition 이 붙기 쉽다. 그래서 이쪽
 * definition 의 주어를 **남기는 근거** 로 고정했다 — 패턴이 제 앞 조각과 뒤 조각으로
 * 겹치는 길이를 텍스트와 무관하게 미리 셈해 둔 표, 그리고 그 표가 정하는 밀 거리와
 * 이미 맞은 것으로 둘 길이. 저쪽은 **버리는 일** 을 주어로 삼는다. keywords 도
 * 이쪽은 실패 함수 · 전처리 · 경계(border) 어휘를, 저쪽은 단순 방식 · 헛수고 어휘를
 * 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const prefixSuffixJumpConcept: FacetConceptSource = {
  id: 'prefixSuffixJump',
  label: 'Prefix–Suffix Overlap (How Far the Pattern May Jump)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:prefixSuffixJump',

  surface: {
    definition:
      'A table computed from the pattern alone, holding for each prefix the longest length that is both its head and its tail, which fixes how far the pattern may move after a mismatch and how much stays matched.',
    exemplarKeywords: [
      'failure function',
      'prefix function',
      'partial match table',
      'longest proper prefix that is also a suffix',
      'border of a string',
      'KMP preprocessing',
      'the table computed before the search starts',
      'never move backwards in the text',
      'skip ahead after a mismatch',
      'how far can the pattern shift',
      'the pattern holds the answer inside itself',
    ],
  },

  briefing: {
    observable: [
      'The upper half never touches the text: a band widens over the first one, two, three characters of the pattern in turn, and a dashed copy of that piece drops below and slides right one cell at a time until the cells it still covers read the same as the ones underneath.',
      'The length that survives that sliding falls as a number out of the pattern row into a table cell below it, so each entry of the table is seen being derived rather than being quoted — the five cells fill in as zero, zero, one, two, zero.',
      'The last entry is decided by the copy sliding clear off the end with nothing overlapping at all, and the caption says so, which is why the table ends in a zero rather than continuing to grow.',
      'The lower half then uses the finished table: the pattern block under the text matches four characters, fails on the fifth, and a curved line is drawn from one table cell down to the block — the distance to move comes from the table, not from the character that failed.',
      'The block jumps more than one cell and lands with the leading characters already painted in the kept tone, in the text row as well as in the block, and the next round of comparing starts after them instead of at the pattern front.',
      'The position the block flew over is left behind with a dashed crossed-out box: an alignment that was never tried, marked as skipped rather than silently absent.',
      'Only two alignments are ever examined on this text before the pattern is found, and the caption names the position it sits at.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole thing on its own — the table being built entry by entry, then the search that uses it — and stops on the position where the pattern was found.',
        'Two buttons: Replay, and a step control that rewinds and walks the same run one move at a time, which is the way to stop on a single sliding of the copy or on the line coming down from the table.',
        'The pattern and the text are fixed, so an article can name the entries of the table and the one jump the search makes.',
      ],
    },

    useWhen: [
      'The article presents the failure table as an array of numbers the reader is expected to accept, and what is missing is where those numbers come from: the pattern folded onto itself, with no text involved.',
      'A reader has to be convinced that the text pointer never goes backwards, and the leading characters staying marked as matched after the jump — in the text row, not only in the pattern — is the thing that has to be seen for that claim to land.',
      'The prose has argued that a mismatch wastes a partial match, and now has to say precisely how much of it is recoverable: the answer is a length the pattern already contains, and the table is where it is kept.',
    ],

    avoidWhen: [
      'The article derives the jump from the text character that caused the mismatch. The distance here is read out of a table built before the text was ever looked at.',
      'The subject is the efficient linear-time construction of the table, where each entry reuses the previous one. Every entry here is found by trying overlap lengths one after another, which is the definition rather than the method used in practice.',
      'The article needs every occurrence, or the count of occurrences. The search here ends at the first full match.',
      'The subject is matching by a fingerprint of a window, sorted suffixes of the text, or one pass over many patterns at once.',
      '"Prefix" in the article means a URL or path prefix, a prefix sum, or a shared beginning between different stored words rather than between a string and itself.',
    ],

    contrastWith: [
      {
        concept: 'kmp',
        note: 'The lengths and the place they are spent: this settles what the overlaps are and how they were arrived at, while that claims what consulting them is worth across a whole text — one crossing, and a comparison count that stops answering to the pattern length.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'Two halves of one argument: that one names what a mismatch discards, while this one names the grounds on which part of it may be kept, and the gap between the two is the overlap length.',
      },
      {
        concept: 'sharePrefixPath',
        note: 'Both turn on a prefix being shared, but there it is shared between different stored strings so that one path serves them all, while here a single string shares a prefix with its own tail.',
      },
      {
        concept: 'requiresSorted',
        note: 'Both are preparation that licenses skipping, but one demands an arrangement of the data being searched, while this demands nothing of the text and prepares only the thing being looked for.',
      },
    ],
  },
};

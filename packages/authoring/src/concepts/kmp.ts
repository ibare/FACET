/**
 * kmp 개념 선언.
 *
 * canonical facet 은 `facet:kmp` — 완제품이다. 되풀이가 심한 글 쉰넷 위에서 두
 * 방식이 위아래로 나란히 굴러간다. 위는 한 칸씩 미는 방식, 아래는 KMP. 그 아래
 * 겹침 표 한 줄이 훑기에 앞서 채워지고, 다시 그 아래 막대 둘이 견준 횟수를 잰다.
 * 단순 막대에서 KMP 막대를 넘어선 구간이 헛수고이고 그 수가 따로 크게 적힌다.
 * 손잡이는 패턴 길이 하나(4 · 6 · 8 · 10 · 12)다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 둘과 붙기 쉽다. `naiveShiftByOne` 은 **버리는 일**을, `prefixSuffixJump`
 * 는 **남길 근거인 표 그 자체**를 주어로 삼는다. 이쪽 definition 의 주어는 **그
 * 표를 훑기에 실어 넣은 검색** 이다 — 표가 사는 자리. 그리고 조각 어느 쪽도 말할
 * 수 없는 것, 즉 **패턴을 길게 밀어도 견줌이 늘지 않는다**는 계측이 이 개념만의
 * 주장이다. keywords 도 이쪽은 알고리즘 이름 · 선형 시간 · 되읽지 않음 어휘를 갖고,
 * 조각들은 각각 헛수고 어휘와 실패 함수 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const kmpConcept: FacetConceptSource = {
  id: 'kmp',
  label: 'KMP (What the Overlap Table Is Worth on a Text)',
  canonicalFacet: 'facet:kmp',

  surface: {
    definition:
      "A string search that carries the pattern's own overlap lengths into the scan, so the text is read once and the comparison count barely rises as the pattern grows.",
    exemplarKeywords: [
      'Knuth-Morris-Pratt',
      'KMP string matching',
      'linear time substring search',
      'the text pointer never goes backwards',
      'no character of the text is read twice',
      'preprocess the pattern, then scan once',
      'a worst-case guarantee for string search',
      'comparisons stop answering to the pattern length',
      'brute force against KMP on the same text',
      'does building the table pay for itself',
    ],
  },

  briefing: {
    observable: [
      'Two sweeps run on one grid, the same text drawn twice with a rule between them, so the distance each method has travelled can be read against the same characters.',
      'In the upper sweep a bar between the rows widens for every character that agrees and collapses to nothing the moment one does not, and only then does the strip below move — by a single cell.',
      'In the lower sweep the characters carried over from the previous alignment stay in a settled tone in the text row as well as in the strip, and comparing resumes after them instead of at the front.',
      'A row of table cells fills in before either sweep begins, one entry at a time, and each caption gives what the building has cost so far; during the scan the cell whose value is being borrowed lights up.',
      'The two bars share one fixed scale, and the upper bar is drawn in two segments — the part the lower one also paid, and beyond it a differently coloured overshoot. That overshoot is the waste, and its size is printed large beneath the bars.',
      'The lower sweep reaches the end of the text while the upper one is still going, and the caption says so outright before the totals arrive.',
      'The closing lines separate three quantities that are usually collapsed into one: the two comparison counts, and the cost of building the table, which is never folded into either.',
      'Pushing the handle re-runs the same text, and the lower bar comes back to almost the same length every time — 78 at the shortest pattern, 69 at the longest — while the upper bar runs from 128 out to 279.',
      'The pattern occurs exactly once at every handle position and is marked where it is found, yet neither sweep stops there; both carry on to the end so the counts cover the whole text.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a five-position slider for the pattern length, at four to begin with, and moving it re-runs the same text from the start.',
        'Four readouts stand beside the handle — the two comparison counts, the difference between them, and what the table cost — so the trade can be read as numbers as well as bar lengths.',
        'The code panel holds two functions whose outer loop and inner comparison loop are written identically; the two lines that differ are where the inner loop starts and how far the pattern moves.',
        'The text and the five patterns are fixed, and every number on screen is counted during the run rather than written in, so an article can name the counts and expect them.',
      ],
    },

    useWhen: [
      'The article calls the method linear and a reader takes that as an asymptotic promise rather than something to be seen. Moving the handle from four characters to twelve while the lower bar returns to nearly the same length, against an upper bar that more than doubles, turns the promise into two measurements on one text.',
      'A reader has accepted that a mismatch might keep part of what it matched but cannot picture where the kept part then lives. The carried-over characters stay marked in the text row itself and the next comparison begins after them, so keeping is a visible state rather than an accounting claim.',
      'The prose is about to concede that preparation is not free and wants the concession checkable. Building the table is charged to its own readout and never folded into the scan, and even at the longest pattern the two added together land far under what restarting at every position spends.',
    ],

    avoidWhen: [
      'The subject is where the overlap lengths come from — the pattern being folded onto itself, each entry found by trying lengths in turn. The table is built here by the shortcut that reuses the entry already settled, and the derivation is not on screen.',
      'The article works the move out from the text character that broke the match. Every distance here is read out of the pattern, settled before the text was looked at.',
      'The point is that a search can proceed with nothing prepared at all. A table is built over the pattern before the first comparison and its cost is counted.',
      'The subject is finding several patterns together, or preparing the text so that later patterns come cheap. One pattern is prepared here and it answers for that pattern alone.',
      'The article is about matching that tolerates differences — wildcards, character classes, a distance between two strings. Every character here has to agree exactly.',
    ],

    contrastWith: [
      {
        concept: 'prefixSuffixJump',
        note: 'The table and the place it earns its keep: that one settles what the overlap lengths are and where they come from, while this claims what they are worth once a scan consults them — a text crossed once and a comparison count that stops answering to the pattern length.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'That one names the loss and stops at naming it; this sets a saving against the loss and measures the gap between them, so one is an argument about a single alignment and the other about a whole text.',
      },
      {
        concept: 'boyerMoore',
        note: 'Two ways to spend less on one pattern: this keeps whatever a mismatch already matched so no character is read a second time, while that reads less of the text in the first place and makes no promise about what it does read.',
      },
      {
        concept: 'rabinKarp',
        note: 'Both cut the cost of the same search, but one removes repeated comparison outright and owes nothing to the shape of the text, while the other trades that guarantee for a number whose agreement still has to be checked.',
      },
      {
        concept: 'zAlgorithm',
        note: 'Both prepare one string and read an answer off the preparation, but one consults its lengths during the scan to decide where to resume, while the other measures agreement with a front and lets the occurrences fall out of the finished measurements.',
      },
    ],
  },
};

/**
 * naiveShiftByOne 개념 선언.
 *
 * canonical facet 은 `facet:naiveShiftByOne` — 조각(piece)이다. 텍스트 한 줄과 그
 * 아래를 미끄러지는 패턴 띠, 맞은 만큼 차오르다 어긋나면 0 으로 무너지는 이음 띠,
 * 자리마다 하나씩 놓인 표식 일곱, 그리고 견준 횟수를 말하는 마지막 캡션이 전부다.
 * 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * KMP 묶음의 두 조각은 **문제와 답**이라 definition 이 붙기 쉽다. 그래서 이쪽
 * definition 의 주어를 **버리는 일** 로 고정했다 — 앞에서부터 견주다 어긋나면 여태
 * 맞힌 글자를 통째로 버리고 한 칸만 민다는 절차 그 자체. 형제
 * `prefixSuffixJump` 는 반대로 **남기는 근거** (패턴이 제 앞뒤로 겹치는 길이의 표)
 * 를 주어로 삼는다. keywords 도 이쪽은 단순 방식 · 헛수고 · 되풀이 어휘를 갖고,
 * 저쪽은 실패 함수 · 전처리 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const naiveShiftByOneConcept: FacetConceptSource = {
  id: 'naiveShiftByOne',
  label: 'Shifting the Pattern One Place (What a Mismatch Throws Away)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:naiveShiftByOne',

  surface: {
    definition:
      'Searching a text for a pattern by comparing from the pattern front at every position, where a mismatch discards the characters already matched and moves the pattern forward by exactly one place.',
    exemplarKeywords: [
      'naive string matching',
      'brute force substring search',
      'slide the pattern one position',
      'start the comparison over from the beginning',
      're-reading characters already compared',
      'wasted comparisons',
      'quadratic matching cost',
      'find a substring inside a string',
      'why the obvious way is slow',
      'four letters matched and then thrown away',
    ],
  },

  briefing: {
    observable: [
      'Two rows on one ruler: the text above and the pattern below it as a strip that slides, so the distance the pattern travels can be read against the characters it travelled over.',
      'A bar between the rows grows one cell wider for each character that matches and collapses to zero width the moment one does not, and only after that collapse does the strip slide — by a single cell, while the bar had reached four.',
      'The very first position matches four characters before failing on the fifth, which is the length being thrown away; the position immediately after it fails on its first character and is over in one comparison, so the four matches bought nothing for the next attempt.',
      'A cursor above the text returns to the front of the pattern after every mismatch and walks forward again over text cells it has already visited.',
      'A row of small ticks along the bottom, one per starting position, lights the one in use and dims the ones already spent, so how many alignments the sweep has consumed is countable rather than asserted.',
      'The pattern is found at one position and a mark is left there, but the sweep does not stop — it keeps trying the remaining positions, and the closing caption gives the number of character comparisons the whole sweep cost.',
    ],

    screen: {
      affordances: [
        'The screen plays every starting position on its own and stops on the closing caption with the found mark still in place.',
        'Two buttons: Replay, and a step control that rewinds and walks the same sweep one comparison at a time, which is the way to stop on the collapse of the bar.',
        'The text and the pattern are fixed, so an article can name the four characters matched at the first position and the position where the pattern is finally found.',
      ],
    },

    useWhen: [
      'The article says a simple matcher "re-reads the text" or "does the same work twice", and the reader has never seen what is lost: a run of matched characters collapsing to nothing while the pattern advances a single place.',
      'A reader has to accept that the cost is not in the positions that fail immediately but in the ones that almost succeed, and the two adjacent positions here — four characters matched, then one character and out — put both cases side by side on the same text.',
      'The prose is about to introduce a faster matcher and needs the reader to feel the waste first, so that the saving being proposed has something to be measured against.',
    ],

    avoidWhen: [
      'The article compares characters from the end of the pattern rather than the front, or decides a shift distance by looking at the text character that failed. Comparison here always restarts at the pattern front and the shift is always one.',
      'The subject is matching by a fingerprint of a window rather than by characters — a rolling hash, a checksum over a sliding window.',
      'The subject is a structure built over the text ahead of time, such as sorted suffixes or an automaton driven by many patterns at once. Nothing is prepared here before the sweep begins.',
      'The article means finding a value in a row of independent items, where a failed position tells you nothing about where to resume. What is being sought here is a run of adjacent characters.',
      '"Shift" in the article means moving array elements to close a gap, or a bitwise shift.',
    ],

    contrastWith: [
      {
        concept: 'kmp',
        note: 'The loss and what is set against it: this names what a mismatch throws away, while that puts a saving beside the loss on the same text and measures the gap between them as the pattern is made longer.',
      },
      {
        concept: 'prefixSuffixJump',
        note: 'Two halves of one argument: this one names what a mismatch discards, while that one names the grounds on which part of it could have been kept.',
      },
      {
        concept: 'scanUntilFound',
        note: 'Both look without any preparation, but one asks whether a single position holds a value, while this asks whether a run of adjacent characters starts there, which is what makes a failed attempt raise the question of where to resume.',
      },
      {
        concept: 'walkPerCharacter',
        note: 'Both spend one comparison per character, but one moves through a structure built in advance from the strings being stored, while this keeps nothing between attempts and pays again at every starting position.',
      },
    ],
  },
};

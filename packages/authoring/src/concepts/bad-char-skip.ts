/**
 * badCharSkip 개념 선언.
 *
 * canonical facet 은 `facet:badCharSkip` — 조각(piece)이다. 위쪽에 패턴 글자마다
 * "패턴 안에서 마지막으로 선 자리" 를 담은 칸 여섯(e 6 · x 1 · a 2 · m 3 · p 4 ·
 * l 5)과 패턴에 없는 글자가 가는 점선 칸(−1)이 있고, 아래에 글
 * `here is a simple example` 이 자리 번호를 달고 깔린다. 패턴 `example` 은 한
 * 덩어리로 미끄러지고, 어긋난 글자가 띠에서 떠올라 제 칸으로 날아가 칸이 켜진 뒤에야
 * 덩어리가 뛴다. 민 거리는 호(arc)에 숫자로 남는다. 계기도 코드 패널도 없고
 * 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 `matchFromBack` 과는 **방향과 근거**로 갈랐다. 이쪽 definition 의 주어는
 * **미는 거리의 출처** 다 — 텍스트에서 만난 어긋난 그 글자, 그리고 그 글자가 패턴
 * 안에서 마지막으로 선 자리. 저쪽은 **견주는 방향** 을 주어로 삼고 미는 말을 아예
 * 쓰지 않는다. 둘 다 "어긋나면 민다" 로 줄지 않게 한 장치다.
 *
 * `prefixSuffixJump` 와의 경계가 이 개념의 값이다 — 저쪽은 **패턴이 제 안에 가진
 * 정보**(앞뒤 겹침)를 텍스트를 보기도 전에 셈해 두고, 이쪽은 **텍스트에서 만난
 * 글자**로 셈한다. 근거의 출처가 다르다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const badCharSkipConcept: FacetConceptSource = {
  id: 'badCharSkip',
  label: 'Bad Character Skip (The Letter That Failed Sets the Distance)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:badCharSkip',

  surface: {
    definition:
      'A shift distance read off the text character that caused the mismatch: the pattern advances until that character meets its own last occurrence inside the pattern, and clear past it when the pattern holds no such character.',
    exemplarKeywords: [
      'bad character rule',
      'bad character heuristic',
      'last occurrence table',
      'Boyer-Moore bad character',
      'the letter does not occur in the pattern',
      'jump the whole length of the pattern',
      'align the last occurrence of the character',
      'how far to shift after a mismatch',
      'skip table for substring search',
      'Horspool shift',
      'the character that broke the match decides the move',
    ],
  },

  briefing: {
    observable: [
      'A row of boxes across the top holds one entry per distinct character of the pattern, each showing that character beside the position it last stands at inside the pattern, and a final dashed box marked −1 stands for any character the pattern does not contain at all.',
      'Below the table the text is laid out as a band that never moves, with its position number printed above every cell, so the positions the captions name can be found by eye.',
      'The pattern travels as one framed block beneath the text, and a cursor walks it from its right end leftward, painting agreeing pairs in one tone and the failing pair in another.',
      'When a comparison fails, the failing text character lifts out of the band as a tile and flies up into the table, landing in the box that holds it, or in the dashed box when no box holds it; that box lights up and the block has still not moved.',
      'Only after the box lights does the block slide, and an arc is drawn beneath it from where it left to where it lands, labelled with the number of cells it covered, so the distance stays on screen as a trace instead of a claim.',
      'The first move follows a letter with no box of its own and the caption says nothing can overlap it, and the block jumps seven cells. The next follows a letter that does have a box, holding 4, and the caption says the slide is only two; a later one whose box holds 1 slides five, so a box further to the left buys a longer move.',
      'A third move also follows a letter absent from the table, yet its jump is three rather than seven, because the comparison had already worked part of the way into the pattern before failing.',
      'Five positions in all are tried on this text; at the last of them all seven characters agree, the caption says so, and the block bounces in place at position 17.',
    ],

    screen: {
      affordances: [
        'The screen runs the whole search by itself and stops with the block resting on the position where the pattern was found.',
        'Two buttons: Replay, and a step control that rewinds and walks the same run one move at a time, which is the way to stop on the letter in flight to the table or on the arc while it is being drawn.',
        'The text and the pattern are fixed, so an article can name the entries of the table, each of the four moves, and the position of the match.',
      ],
    },

    useWhen: [
      'The article hands the reader a shift table as a formula to be trusted, and what is missing is why so large a move cannot sail past an occurrence: a letter with no box of its own, which no cell of the pattern could ever cover, is the argument for leaping clear of it.',
      'A reader has to accept that the distance is a lookup rather than a guess, and the failing letter leaving the band, landing in its own box and lighting it before the block has moved at all, is what makes the lookup the visible cause of the move.',
      'The prose needs both halves of one rule on a single run: a letter the pattern does contain nudges the block just far enough to line that letter up, a letter it lacks throws the block far ahead, and both distances come out of the same row of boxes.',
    ],

    avoidWhen: [
      'The article works the move out from what the pattern has already matched — the overlap between the pattern head and its own tail. The distance here is looked up from a character taken out of the text.',
      'The subject is the worst case or a guaranteed bound. This runs on a text where the rule does well, and nothing on screen speaks to the case where every move collapses to a single cell.',
      'The subject is the rule that reasons about the matched tail instead, or the full method that takes whichever of two rules moves further. One rule decides every move here.',
      'The article needs every occurrence, or a count of them. The run ends at the first full match.',
      '"Skip" in the article means a skip list, records skipped in a query, or a step passed over in a schedule.',
    ],

    contrastWith: [
      {
        concept: 'boyerMoore',
        note: 'One move and the run of them: this settles how far a single failure may push the pattern, while that asks what those distances average out to once the pattern is made longer.',
      },
      {
        concept: 'prefixSuffixJump',
        note: 'Both answer how far the pattern may move after a mismatch, but one reads the answer out of the pattern folded onto itself, worked out before any text was seen, while this reads it off the text character that broke the match — the grounds come from opposite sides.',
      },
      {
        concept: 'matchFromBack',
        note: 'Two halves of one method: that one settles which end the comparison starts from, and this settles how far the pattern travels once the comparison has failed.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'Both move the pattern on after an alignment fails, but one moves a single place no matter what went wrong, while this lets the identity of the offending character fix the distance, so the same failure can be worth one place or many.',
      },
      {
        concept: 'hashToBucket',
        note: 'Both turn a character into a number that decides where something goes, but there the number is a storage slot chosen to spread values evenly and any character may yield any slot, while here it is the last position that character occupies inside the pattern, and nothing about it is free to choose.',
      },
    ],
  },
};

/**
 * boundaryShift 개념 선언.
 *
 * canonical facet 은 `facet:boundaryShift` — 조각이다. 줄 둘에서 낱말이 통째로
 * 서 있다가 글자 하나가 바뀌고, 그 순간 경계가 갈라져 조각이 벌어진다.
 * `here` 하나 대 `hers` 셋, `that` 하나 대 `than` 셋이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념의 주어는 *입력이 조금 달라졌을 때의 취약함* 이다 — 조각 수가 낱말의
 * 생김새를 따라가지 않는다는 것 하나.
 *
 *   subwordSegmentation   어휘가 자랄 때 일어나는 일
 *   betweenLetterAndWord  세 가지 자르기 단위를 견주는 일
 *   spaceIsPartOfIt       경계를 어떻게 적어 두는가
 *
 * 어휘 배타 — 이 화면은 어휘 크기를 한 번도 보이지 않고 빈칸도 다루지 않는다.
 * definition 도 그대로다: merge · vocabulary · gap · blank · coarse · grain 이
 * 0 건이고, 이쪽만 쥐는 낱말로 선다 — differ in one position · near twin ·
 * stands whole · does not follow the length.
 *
 * 이웃 `tokenization`(컴파일러의 렉싱)의 낱말도 0 건이다. 저쪽은 같은 입력에
 * 언제나 같은 답을 내는 것이 보장인데 이쪽은 그 보장이 없다는 말이라, 어휘가
 * 겹치면 정반대의 주장이 한 점으로 모인다. contrastWith 가 그 차이를 적는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const boundaryShiftConcept: FacetConceptSource = {
  id: 'boundaryShift',
  label: 'One Character Apart (Unstable Fragment Boundaries)',
  canonicalFacet: 'facet:boundaryShift',

  surface: {
    definition:
      'Two spellings that differ in one position can be divided quite differently: one stands whole while its near twin falls into three, so the count of fragments does not follow the length of a word.',
    exemplarKeywords: [
      'a typo makes a word cost more',
      'rare spellings fall apart',
      'near-identical words divided differently',
      'estimating length in tokens by counting characters',
      'brittle boundaries',
      'sharing a prefix guarantees nothing',
      'why misspellings are handled worse',
      'unstable segmentation under small edits',
      'common words survive intact and rare ones shatter',
      'the cuts land where nothing means anything',
    ],
  },

  briefing: {
    observable: [
      'Two independent lanes run the same demonstration on two different pairs, so the effect is shown twice rather than once, and the second pair rules out the first having been a curiosity.',
      'A word arrives from above and settles as a single unbroken tile, which establishes that standing whole is the ordinary case before anything is disturbed.',
      'One cell is highlighted and the letter in it is replaced in place: the old glyph lifts and fades upward while its replacement rises from below into the same cell, so exactly one position is seen to change and every other letter is seen not to.',
      'The break is drawn as the letters staying exactly where they are while the spaces between them widen — nothing is re-spelled, only re-grouped, and the tiles dip at staggered depths as they part.',
      'A dashed outline is left behind at the full width the word occupied while it was whole, so the reader can still see what it was after it has come apart.',
      'A fragment that carries the end of the word wears a small end-of-word mark on its right side, and that mark travels with the fragment when it moves, so it reads as part of the fragment rather than as an annotation.',
      'The captions report the count at each stage, one before the change and three after it, and the closing caption states that one position of difference produced cuts in different places.',
      'In both lanes the two words share every letter but the last, and in both the whole one becomes three parts, so the break is not confined to a single unlucky word.',
    ],

    screen: {
      affordances: [
        'Two buttons only: replay, and a step control for taking the run one move at a time, which is how a reader can hold the frame after the letter has changed but before the boundary has given way.',
        'The screen plays both lanes through by itself and then waits on the closing statement.',
        'The word pairs are fixed, so an article can quote both words, the position that differs, and the parts the broken one falls into.',
      ],
    },

    useWhen: [
      'The article budgets by counting characters or words and treats length as a proxy for cost. Two words of identical length ending up one part against three is the falsification, and it has to be seen on words the reader would have assumed were equivalent.',
      'The prose claims that unusual spellings are handled worse and leaves the reason implicit. What the reader needs is that sharing the first three letters with a common word buys nothing at all, because the grouping was fitted to whole forms rather than built up from parts.',
      'A reader assumes the cuts fall at meaningful joints, on stems and endings. Watching a word come apart at places that correspond to nothing is what dislodges that, and it only works if the word is one whose parts obviously mean nothing.',
      'The article is about robustness of an input pipeline under small perturbations, and needs a concrete instance where a single altered position changes the representation wholesale rather than slightly.',
    ],

    avoidWhen: [
      'The subject is how the grouping was learned, in what order, or from what counts. Both words here are divided by one fixed arrangement that the screen never opens up.',
      'The point is that a larger symbol set produces shorter sequences, or how large that set should be. Nothing is counted here except the parts of two words, and no size is ever reported.',
      'The article is about whether to divide at words, at fragments or at characters. That is settled before this begins, and what varies is the input rather than the method.',
      'The subject is how the space between words is recorded, or the difference a preceding gap makes. Every word here is examined on its own with nothing in front of it.',
      'The article is about a compiler dividing program text, where the same input is guaranteed the same division and a one-character edit changes only what that character belongs to.',
      'The subject is spelling correction, fuzzy matching, or edit distance between words. The two words here are never compared to each other by the method; each is divided independently and only the reader compares the results.',
    ],

    contrastWith: [
      {
        concept: 'subwordSegmentation',
        note: 'Mirror images of the same dependency. There the sentence is held still and the symbol set varies, which yields a smooth and predictable trend; here the symbol set is held still and the input varies, which yields no trend that could be extrapolated from.',
      },
      {
        concept: 'betweenLetterAndWord',
        note: 'That says the middle grain is the useful one; this says the middle grain is not applied evenly. Two words of equal length can be treated quite differently, which is what it costs to have fitted the units to a corpus instead of defining them.',
      },
      {
        concept: 'spaceIsPartOfIt',
        note: 'Two reasons one word yields different fragments. There the word is untouched and only what precedes it differs; here nothing around the word changes and the difference is inside it, so neither cause can be reduced to the other.',
      },
      {
        concept: 'tokenization',
        note: 'Where the two disagree is on what stability is owed. There a one-character edit changes only the unit containing it, because a grammar fixes the boundaries in advance; here no such guarantee exists, and an edit can redraw boundaries that do not touch the character that changed.',
      },
    ],
  },
};

/**
 * betweenLetterAndWord 개념 선언.
 *
 * canonical facet 은 `facet:betweenLetterAndWord` — 조각이다. 한 문장이 세 줄에
 * 나란히 놓여 낱말 · 조각 · 글자 세 크기로 갈라지고, 줄 끝의 수 6 · 9 · 28 이
 * 저절로 층계를 이룬다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념의 주어는 *세 가지 자르기 단위를 견주는 일* 이다 — 어느 굵기를 고를
 * 것인가 하나. 어휘를 **어떻게 얻는지는 이 화면이 말하지 않으므로** definition 도
 * 말하지 않는다.
 *
 *   subwordSegmentation   어휘가 자랄 때 일어나는 일
 *   spaceIsPartOfIt       경계를 어떻게 적어 두는가
 *   boundaryShift         입력이 조금 달라졌을 때의 취약함
 *
 * 어휘 배타 — definition 에 merge · vocabulary · gap · blank · differ 가 0 건이다.
 * 이쪽만 쥐는 낱말은 coarse · grain · whole word · single letter · unfamiliar 다.
 *
 * 이웃 `tokenization`(컴파일러의 렉싱)의 낱말도 0 건이다 — lexer · scanner ·
 * token · maximal munch · compiler. 저쪽은 단위의 크기를 묻지 않는다. 문법이 이미
 * 정해 두었기 때문이고, 그 점을 contrastWith 가 개념 층위에서 적는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const betweenLetterAndWordConcept: FacetConceptSource = {
  id: 'betweenLetterAndWord',
  label: 'Between Letter and Word (Choosing How Coarse to Divide)',
  canonicalFacet: 'facet:betweenLetterAndWord',

  surface: {
    definition:
      'How coarse the division of text should be: whole words are few but fail on an unfamiliar one, single letters never fail but carry no meaning alone, and the workable grain lies between the two.',
    exemplarKeywords: [
      'word-level against character-level',
      'granularity of the split',
      'why not just use whole words',
      'why not just use single characters',
      'an unfamiliar word at word level',
      'a shared ending such as -ing',
      'one sentence divided three ways',
      'morpheme-sized fragments',
      'reusing a common ending across many words',
      'character-level models',
    ],
  },

  briefing: {
    observable: [
      'Three rows hold the same sentence, left edges aligned and sharing one letter width, and each begins as a single unbroken tile so that all three start identical and only the cutting tells them apart.',
      'A row does not redraw when its turn comes — the tile breaks into parts and the letters spread apart to the right, so the row grows longer by exactly the number of cuts made in it.',
      'Because each cut widens the row, the counts printed at the three row ends form a staircase: six, then nine, then twenty-eight, with the count sitting where the measuring happens rather than on a separate gauge.',
      'The three rows are labelled word, piece and letter down the left edge.',
      'The middle row lands much nearer the top row than the bottom one — nine against six and twenty-eight — so the in-between unit is visibly closer to words than to letters rather than halfway between them.',
      'On the closing step, coloured ticks rise through the middle row only where a cut falls inside a word; cuts that coincide with a word edge get no tick, which is what marks the cutting as having moved inward.',
      'Common short words stay whole while longer ones part into a stem and an ending, so the middle row is not uniformly sized — some of its parts are whole words and some are word fragments.',
      'Once it has played through, dragging the playback strip under it returns the rows to any earlier cut and forward again.',
    ],

    screen: {
      affordances: [
        'A Replay button and a playback strip, which becomes usable once the run has finished. Dragging the strip back to the middle row is how a reader can stop there before the third row spoils the comparison.',
        'The screen plays the three cuts and the closing comparison by itself and then waits.',
        'The sentence is fixed, so an article can name the words that stay whole and the ones that part, and quote the three counts.',
      ],
    },

    useWhen: [
      'The article opens by asking why text is not simply divided at the spaces, and the reader has no reason to find that inadequate. Both failures have to be visible under one unchanged sentence: the whole-word row cannot absorb anything new, and the single-letter row carries nothing.',
      'The reader concludes that a middle setting must be a midpoint. Nine standing against six and twenty-eight, all three measured from the same sentence, is what corrects the arithmetic intuition before it hardens.',
      'The prose argues that a common ending is worth learning once and reusing, and the reader needs to see the ending actually detached from more than one word rather than described as detachable.',
      'A reader has to grasp that the cutting moved inward rather than merely multiplied, and the distinction only lands when cuts falling inside a word are told apart from cuts falling at its edges.',
    ],

    avoidWhen: [
      'The subject is how the middle row\'s cutting positions were arrived at, or what would move them. This screen divides with a unit set already in hand and never shows where it came from.',
      'The point is that more units mean shorter sequences, or the cost of enlarging the unit set. Nothing is varied here; three fixed ways of dividing one sentence are laid side by side once.',
      'The article is about how the space between words is preserved so the original text can be recovered.',
      'The subject is a spelling change producing a different division, or the instability of the cutting under small edits. Every row here is cut once and nothing is perturbed.',
      'The article is about a compiler dividing program text, where the sizes of the units are fixed by a grammar and there is no choice of grain to make.',
      'The article uses "word" and "letter" for typography, reading level, or character encoding rather than for units a model consumes.',
    ],

    contrastWith: [
      {
        concept: 'subwordSegmentation',
        note: 'This settles which kind of unit is wanted; that settles how far to go once the kind has been chosen. The choice here is between three incomparable options, and it has to be made before a quantity can be tuned at all.',
      },
      {
        concept: 'spaceIsPartOfIt',
        note: 'Both are about where a cut may fall, on either side of the word edge. This is about how finely to cut inside a word; that is about what happens at the edge itself, and whether crossing it leaves a trace.',
      },
      {
        concept: 'boundaryShift',
        note: 'This says the middle grain is the useful one; that says the middle grain is not evenly applied. Two words of equal length can receive very different treatment, which is the price of a grain that was fitted to a corpus rather than defined.',
      },
      {
        concept: 'tokenization',
        note: 'A question that only one of the two can ask. There the size of a unit is settled by the grammar, so no grain has to be chosen; here nothing settles it in advance and the choice is the whole subject.',
      },
    ],
  },
};

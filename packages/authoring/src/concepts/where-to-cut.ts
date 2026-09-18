/**
 * whereToCut 개념 선언.
 *
 * canonical facet 은 `facet:whereToCut` — 조각이다. 사무실 안내문(문단 셋, 낱말 50, 문장
 * 다섯)이 줄글로 놓이고, 칼이 17 낱말마다 둘 떨어져 상자 셋(17 · 17 · 16)으로 갈린다. 두 칼
 * 모두 문장 한가운데라 그 두 문장이 붉게 남는다. 이어서 칼이 하나씩 문단 끝으로 옮겨 가
 * 상자가 20 · 17 · 13 이 되고, 끊긴 문장은 0 이다. 옛 칼자리는 점선 눈금으로 남는다.
 * 스스로 한 번 재생하고 그 뒤로는 재생 띠로 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **칼이 떨어지는 자리 하나** 다 — 조각 수를 같게 묶어 두고 자리만
 * 바꾼다. definition 의 주어가 "같은 수의 조각" 이고 꼬리가 "문단 끝으로 옮기면 문장이 온전"
 * 이다.
 *
 * 마주 보는 짝 — `overlapTheSeam` 과 꼬리를 교차시켰다. 이쪽은 **조각 수를 지키고 자리를
 * 바꾼다**, 저쪽은 **창 길이를 지키고 낱말을 되풀이한다**. 이쪽 definition 에는 되풀이 ·
 * 저장 · 창(window) · 이음매(seam) 가 0 건이고, 저쪽에는 문단(paragraph) 이 0 건이다.
 *
 * 완제품 `chunking` 이 쥔 rule · window size · storage · full 도 쓰지 않았다. 이 화면에는
 * 창도 저장량도 없고 두 방식의 값은 같다 (조각 수 같음, 겹침 둘 다 없음).
 *
 * ── 전제
 *
 * 글과 17 은 예로 고른 것이다 — 17 은 두 방식의 조각 수가 같아지도록 고른 수다. 낱말은
 * 공백으로 가른 덩이이지 모형의 토큰이 아니다. 문단 자르기가 늘 낫다는 주장이 아니다
 * (문단이 길면 조각이 커진다). 이것을 avoidWhen 에서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const whereToCutConcept: FacetConceptSource = {
  id: 'whereToCut',
  label: 'Where to Cut (Fixed Word Count vs Paragraph Ends)',
  canonicalFacet: 'facet:whereToCut',

  surface: {
    definition:
      'With the number of pieces held equal, cutting a text every fixed count of words drops the cuts inside sentences and tears them in two, while cutting where each block of text the author wrote comes to an end keeps every sentence intact.',
    exemplarKeywords: [
      'fixed-length splitting breaks sentences',
      'split on paragraph boundaries',
      'paragraph-based chunks',
      'a chunk ends mid-sentence',
      'the answer is split across two chunks',
      'structure-aware text splitting',
      'semantic boundaries when splitting documents',
      'why naive splitting loses meaning',
      'cut position in a document',
    ],
  },

  briefing: {
    observable: [
      'A short office notice — three blocks of text, fifty words, five sentences — sits as running text, and the opening caption states those three counts. Words are counted by splitting on spaces, not by any model\'s tokenizer.',
      'The first knife falls after word 17, between "desk and" and "wear a", and the words after it slide down into a second box. The sentence about signing in and wearing a badge turns red, its first half in one box and "wear a badge." in the next, and the caption quotes the first words of the sentence it split.',
      'The second knife falls after word 34, between "charges five" and "dollars per", so the second box ends on "charges five" and the price per hour lands in the third box. The tally reads "Every 17 words: 17 · 17 · 16" and "sentences cut: 2 / 5" in red.',
      'Each knife then travels along the text to the nearest end of a text block — after word 20 and after word 37 — and the stranded words slide back up so the torn sentence rejoins its box, the caption announcing that it is whole again.',
      'Where each knife used to be, a small dotted tick stays in the text, so the old position and the new one can be compared in one picture.',
      'At the end a second tally line for the block-by-block cut reads 20 · 17 · 13 with "sentences cut: 0 / 5" in green, and the closing caption says both ways make three chunks — only the positions differ.',
    ],

    screen: {
      affordances: [
        'The screen plays once by itself — two fixed cuts, then two moves to the ends of text blocks — and stops with both tallies showing.',
        'A Replay button and a playback strip sit underneath. Once the run is over, dragging the strip back holds the picture at the moment a sentence is torn, before any knife has moved.',
        'The notice, its three blocks and the length of 17 are fixed, so an article can quote either torn sentence and the exact words on each side of the cut.',
      ],
    },

    useWhen: [
      'A reader thinks splitting a document is a matter of picking the right size, and the article needs to show that the position of a cut matters on its own: here the count of pieces stays at three and only where the knives fall changes, yet the torn sentences go from two to none.',
      'The article wants a concrete failure of blind splitting that a reader feels immediately — a chunk that ends on "charges five" and so cannot tell anyone what parking costs.',
      'The prose argues for splitting along the document\'s own structure and needs the smallest example where following that structure costs nothing extra.',
    ],

    avoidWhen: [
      'The article needs to weigh settings against their costs — more stored text, underfilled pieces, bigger pieces. Both ways here make three pieces with no repeated words, so there is no bill to show, and cutting at block ends is not shown to be better in general; when the blocks are long it produces oversized pieces.',
      'The subject is repeating words across a boundary so that a sentence caught at it survives. No word here ever appears in two pieces.',
      'The article needs realistic lengths. Seventeen words was chosen only so that both ways make the same number of pieces, and the notice is a made-up example rather than a real document.',
      'The article is about where a lexer or a tokenizer divides text into tokens. The units here are sentences and blocks of sentences, and every word is kept whole.',
    ],

    contrastWith: [
      {
        concept: 'overlapTheSeam',
        note: 'Both answer a sentence caught at a cut, in opposite ways: this moves the cut so it no longer falls inside the sentence, while the other leaves the cut where it is and repeats the words around it so the sentence also appears whole on the far side.',
      },
      {
        concept: 'chunking',
        note: 'This holds everything but the position of the cuts still, so the difference it shows has no cost attached; choosing a splitting setting in practice means trading fewer torn sentences against storage and piece size, which the broader concept weighs.',
      },
      {
        concept: 'betweenLetterAndWord',
        note: 'Both are about where text is divided, but that concept picks the smallest unit a model reads, while this one keeps words intact and asks whether a longer span ends where the meaning does.',
      },
    ],
  },
};

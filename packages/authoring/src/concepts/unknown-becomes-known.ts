/**
 * unknownBecomesKnown 개념 선언.
 *
 * canonical facet 은 `facet:unknownBecomesKnown` — 조각이다. 아래에 조각 열넷을
 * 세운 선반, 가운데에 갈라진 토막이 잠깐 서는 줄, 위에 낱말 줄이 있다. 스스로
 * 한 바퀴 재생하고, 그 뒤로는 한 걸음씩 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **어휘 밖의 입력을 어떻게 받아 내는가** — 거절되지
 * 않는다는 것이다. definition 의 주어가 "목록에 통째로는 없는 낱말 하나" 이고,
 * keywords 도 OOV · 미등록 · 거절 어휘만 갖는다. 완제품 `vocabulary` 는 어휘를
 * 갈아 끼울 때 무엇이 달라지는지를, 조각 `tokensPerLanguage` 는 치우친 어휘가
 * 치르는 값을 맡으므로, 그쪽 낱말(말뭉치 교체 · 언어 · 값)은 여기서 쓰지 않는다.
 *
 * ── 목록과 규칙의 역할 구분
 *
 * 선반의 열넷은 **표시용 산물**이고 자르는 것은 병합 규칙 서른이다. 그래서
 * "목록에서 가장 긴 것을 찾아 맞춘다" 고 쓰면 화면이 하는 일과 어긋난다 —
 * 실제로 `warmness` 는 선반에 없는 조각으로 잘린다. definition 은 "통째로는
 * 목록에 없다" 와 "잘게 잘라 그것으로 적는다" 까지만 말하고, 잘린 조각이 언제나
 * 선반 위에 있다고는 말하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unknownBecomesKnownConcept: FacetConceptSource = {
  id: 'unknownBecomesKnown',
  label: 'Unknown Becomes Known (A Word the Pieces Do Not Hold)',
  canonicalFacet: 'facet:unknownBecomesKnown',

  surface: {
    definition:
      'A word the stored subword pieces do not contain as a whole is cut into smaller parts and spelled out of them, so no input has to be turned away as unrecognised.',
    exemplarKeywords: [
      'out-of-vocabulary word',
      'OOV',
      'the UNK bucket',
      'unregistered word',
      'a word the model has never seen',
      'rare words and misspellings',
      'open vocabulary',
      'made-up and invented words',
      'a suffix split off from a stem',
      'why there is no unknown placeholder',
    ],
  },

  briefing: {
    observable: [
      'A shelf of fourteen pieces rises along the bottom under a small label, and it is stated to be everything available; pieces carrying a word-final mark stand beside otherwise identical ones without it, so the same letters appear twice in two roles.',
      'A word that was in the source material goes first: it divides into two parts, they travel down and settle exactly onto two shelf pieces, and come back up joined — reading a familiar word is shown to be the same act of cutting, not a lookup that skips it.',
      'For the first unfamiliar word a dashed copy of the whole word sweeps along both rows of the shelf and settles on nothing, after which the word\'s own outline turns a warning colour — the failure is staged before the repair.',
      'The word then breaks in two and the halves drop onto shelf pieces of exactly the same width, so the overlap itself carries the claim that these parts are held; the parts then rise and rejoin as the word, now drawn as two abutting tiles with a visible seam rather than one solid block.',
      'The pieces that were matched light up only for the moment of contact and then go back to their ordinary appearance, so each piece is visibly not used up by being used.',
      'The two later unfamiliar words skip the sweep and go straight from splitting to being taken in, so the beat that establishes the failure happens once rather than every time.',
      'Every word that came through stays parked across the top as separated pieces and they are lifted together at the end; the closing counter reports three, counting the unfamiliar words rather than the four words standing there.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence once on its own and stops with the words that came through standing across the top.',
        'Under it sit a Replay button and a playback strip. Once the run is over, dragging the handle to the sweep that matches nothing holds the moment before the split that follows.',
        'The pieces on the shelf and the four words are fixed, so an article can name the word that fails whole and the two parts it arrives as.',
      ],
    },

    useWhen: [
      'An article asserts that splitting into smaller pieces lets a model take words it has never encountered, and the reader has only the assertion. A word sweeping the whole shelf without a match and then coming through in two parts is that assertion made into an event.',
      'A reader assumes anything unfamiliar collapses into a single catch-all marker that loses whatever the word meant. Here the parts that carry the stem and the ending survive the cut and remain legible as themselves.',
      'The prose needs the ordinary case and the hard case held against each other, and the screen handles a familiar word first with the identical gesture before the unfamiliar one arrives.',
    ],

    avoidWhen: [
      'The subject is where the set of pieces came from or how it was built. It is already standing when this begins and never changes.',
      'The point is whether the model understands the word or knows any facts about it. Arriving intact is not the same as being understood, and nothing past the cut is represented.',
      'The article uses "unknown" for unknown values in a program, missing fields in a record, or an unidentified user.',
      'The article is about how many pieces an input costs. The parts here are counted only to show that there are some, not to price the word.',
    ],

    contrastWith: [
      {
        concept: 'vocabulary',
        note: 'Both concern what a set of pieces holds, but what becomes of an input the set lacks is a different question from what changes when the set itself is exchanged for another.',
      },
      {
        concept: 'tokensPerLanguage',
        note: 'Nothing is turned away in either, yet there the number of parts is the loss being reported, while here that same division is the rescue.',
      },
    ],
  },
};

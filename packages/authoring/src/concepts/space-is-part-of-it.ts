/**
 * spaceIsPartOfIt 개념 선언.
 *
 * canonical facet 은 `facet:spaceIsPartOfIt` — 조각이다. 낱말 사이의 빈칸에 표식이
 * 하나씩 서고, 그 표식이 뒤 낱말로 미끄러져 달라붙는다. 아래 선반 두 줄에서 같은
 * 낱말이 붙은 꼴과 안 붙은 꼴로 갈려 세로 짝을 이룬다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념의 주어는 *경계를 어떻게 적어 두는가* 다 — 되돌릴 수 있게 적는 대신
 * 무엇을 치르는가 하나.
 *
 *   subwordSegmentation   어휘가 자랄 때 일어나는 일
 *   betweenLetterAndWord  세 가지 자르기 단위를 견주는 일
 *   boundaryShift         입력이 조금 달라졌을 때의 취약함
 *
 * 어휘 배타 — definition 에 merge · vocabulary · coarse · grain · differ 가 0 건이다.
 * 이쪽만 쥐는 낱말은 gap · character of its own · rejoin · original text · slot 이다.
 * 화면이 캡션에서 "vocabulary" 를 쓰지만 그것은 briefing 의 일이고, 임베딩되는
 * definition 에는 올리지 않았다 — 그 낱말은 subwordSegmentation 이 쥔다.
 *
 * 이웃 `tokenization`(컴파일러의 렉싱)의 낱말도 0 건이다. 특히 whitespace 를
 * 피해 화면 자신의 영어인 blank · gap 으로 섰다 — 저쪽은 whitespace 를 **버리는**
 * 쪽이고 이쪽은 **적어 두는** 쪽이라, 같은 낱말을 쓰면 정반대의 주장이 한 점으로
 * 모인다. avoidWhen 과 contrastWith 가 그 경계를 다시 긋는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const spaceIsPartOfItConcept: FacetConceptSource = {
  id: 'spaceIsPartOfIt',
  label: 'The Blank as a Character (Keeping the Division Reversible)',
  canonicalFacet: 'facet:spaceIsPartOfIt',

  surface: {
    definition:
      'Writing the gap before a word as a character of its own, so the fragments rejoin into the original text exactly, at the cost of one word taking two separate slots — with the gap and without.',
    exemplarKeywords: [
      'SentencePiece',
      'the U+2581 marker',
      'a leading space changes the fragment',
      'why a prompt ending in a space behaves differently',
      'joining the fragments back into the original text',
      'reversible splitting',
      'the same word at the start of a sentence',
      'duplicate entries for common words',
      'position decides which fragment you get',
      'recovering the original spacing',
    ],
  },

  briefing: {
    observable: [
      'The first sentence is laid out with its words held apart, and each gap between them is drawn as a dashed empty outline — the gap is given a place on screen before it is given a symbol.',
      'A marker tile appears standing alone in the middle of each gap, and then slides rightward onto the word that follows it while the words themselves draw together; the dashed outlines fade as it goes.',
      'The leading word of the row never receives a marker, and there is no dashed outline in front of it, so the asymmetry between the first word and every other one is built into the layout.',
      'Frames are then drawn around the fragments one after another, so the row that started as separated words has become a row of fragments that each carry their own leading marker.',
      'A second sentence appears already in its marked form, and its leading word is a word that carried a marker in the first sentence — the same word in the two positions is visibly two different fragments.',
      'The lower half is two shelves, marked below and bare above, laid out in shared columns so that a word present in both stands as a vertical pair, with a line growing from the bare chip down to its marked twin.',
      'Columns where only the marked form exists show a dashed empty box on the bare shelf, so the shelf is not uniformly doubled and the reader can count which words were doubled and which were not.',
      'Into one of those empty boxes a word drops in a red dashed outline and then bursts apart into two smaller chips, because that word never once appeared without its gap in front of it.',
      'The captions carry the counts as they go: the sentence divides into six fragments, five words end up doubled, and the shelves hold fourteen entries in total.',
    ],

    screen: {
      affordances: [
        'Two buttons only: replay, and a step control for taking the run one move at a time, which is how a reader can hold the moment the marker is still standing in the gap before it has attached to anything.',
        'The screen plays the whole run by itself and then waits with both shelves filled.',
        'The sentences and the shelves are fixed, so an article can name the word that appears in both positions, the word that cannot stand alone, and the two pieces it falls into.',
      ],
    },

    useWhen: [
      'The article reports that the same word behaves differently at the start of a sentence than in the middle, and the reader takes it for an oddity of one implementation. Seeing the marker attach, and then seeing both forms occupy their own slots on a shelf, gives the behaviour a cause.',
      'A reader assumes the spacing is simply discarded during division and restored later by convention. The point that has to land is that nothing restores it — it survives only because it was written down as a character while the text was being cut apart.',
      'The prose is about what reversibility costs rather than whether it is achieved: common words are stored twice over, and the room they take is room something else does not get.',
      'The article warns that a trailing space in a prompt changes the result, and the reader needs the mechanism rather than the rule of thumb — a word preceded by a gap and the same word not preceded by one are simply different entries.',
    ],

    avoidWhen: [
      'The subject is how the fragments on the shelves were learned, or in what order, or what would change them. The shelves are already stocked when this screen begins.',
      'The point is that enlarging the fragment set shortens sequences. Nothing is enlarged or varied here; one fixed arrangement is examined for what it costs.',
      'The article is about choosing between whole words, fragments and single characters. That choice is settled here before the screen opens, and only the treatment of the boundary is at issue.',
      'The subject is a spelling change inside a word producing a different division. Every word here is left spelled as it was, and what varies is only what stands in front of it.',
      'The article is about a compiler discarding the space between units as insignificant. Here the space is the thing being preserved, which is the opposite commitment.',
      'The article uses "space" for memory consumption, or for the room a data structure occupies.',
    ],

    contrastWith: [
      {
        concept: 'subwordSegmentation',
        note: 'Both concern the set of symbols, from opposite ends. That asks how many there should be and what growing the count buys; this asks what has to be written into each one so that cutting the text can be undone.',
      },
      {
        concept: 'betweenLetterAndWord',
        note: 'Both are about where a cut may fall, on either side of the word edge. That is about how finely to cut inside a word; this is about the edge itself, and whether crossing it leaves a record.',
      },
      {
        concept: 'boundaryShift',
        note: 'Two reasons the same word comes out as different fragments. There it is something changed inside the word; here the word is untouched and only what precedes it differs, which makes position alone sufficient to change the result.',
      },
      {
        concept: 'tokenization',
        note: 'Opposite commitments about the same blank. There it separates units and is then thrown away, because the grammar can tell where a unit ended without it; here it is promoted to a character precisely because nothing else records that a word began.',
      },
    ],
  },
};

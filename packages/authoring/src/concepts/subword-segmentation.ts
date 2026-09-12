/**
 * subwordSegmentation 개념 선언.
 *
 * canonical facet 은 `facet:subwordSegmentation` — 완제품이다. 문장 한 줄이 타일로
 * 놓이고, 손잡이(병합 0 · 12 · 24 · 36 · 44)를 돌리면 타일들이 서로에게 미끄러져
 * 합쳐지며 조각 수가 33 에서 7 로 준다. 계기 둘(조각 수 · 어휘 크기)과 재생 묶음이
 * 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 넷 다 서브워드 토큰화를 다루므로 **주어의 층위**로 갈랐다. 이 개념의 주어는
 * *어휘가 자랄 때 일어나는 일* 이다 — 병합을 늘리면 같은 문장이 덜 잘린다는
 * 방향 하나.
 *
 *   betweenLetterAndWord   어떤 크기로 자를 것인가 (세 단위를 견준다)
 *   spaceIsPartOfIt        경계를 어떻게 적어 두는가
 *   boundaryShift          입력이 조금 달라졌을 때의 취약함
 *
 * 어휘 배타 — 이 definition 은 저 셋의 낱말을 쓰지 않는다. 굵기(coarse · grain) ·
 * 빈칸(gap · blank) · 한 글자 차이(differ · twin) 가 하나도 없고, 대신 이쪽만
 * 쥐는 낱말로 선다: merge · vocabulary · fewer · longer.
 *
 * 이웃 `tokenization`(컴파일러의 렉싱)과도 definition 에서 낱말이 겹치지 않는다 —
 * lexer · scanner · token · maximal munch · compiler 가 0 건이다. 저쪽은 문법이
 * 미리 정해 둔 단위로 자르고, 이쪽은 말뭉치에서 배운 단위로 자른다. 그 경계를
 * avoidWhen 이 밀어내고 contrastWith 가 개념 층위에서 다시 긋는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const subwordSegmentationConcept: FacetConceptSource = {
  id: 'subwordSegmentation',
  label: 'Subword Segmentation (Growing the Vocabulary)',
  domain: 'ai-engineering',
  canonicalFacet: 'facet:subwordSegmentation',

  surface: {
    definition:
      'Growing a vocabulary by repeatedly merging the most frequent adjacent pair, so that one unchanged sentence is divided into steadily fewer and longer fragments as the number of merges rises.',
    exemplarKeywords: [
      'byte pair encoding',
      'BPE',
      'vocabulary size',
      'merge rules learned from a corpus',
      'training a tokenizer',
      'how many merges to run',
      'a bigger vocabulary cuts less',
      'the most frequent adjacent pair wins',
      'suffixes emerge from frequency alone',
      'trading vocabulary size against sequence length',
    ],
  },

  briefing: {
    observable: [
      'The sentence lies in a single row of tiles, one tile per fragment, and every run begins from the same starting row of thirty-three single letters no matter which setting is chosen.',
      'A dashed vertical tick is planted at the length the row has with no merges and never moves again, and a solid bar beneath the row shrinks away from it, so the shortening is measured against a fixed reference rather than remembered.',
      'Each learned rule that actually touches this sentence is one step: the two tiles slide into each other and become one tile, every tile to the right is pulled leftward, and the row visibly contracts.',
      'The rule being applied is written out in symbols above the caption in the form of two fragments and their joined result, while the caption states it in words together with how many fragments remain.',
      'Rules that the corpus learned but that never match this sentence are skipped entirely, so the rule numbers in the caption jump — step after step the caption may read rule three, then rule five of the same total.',
      'A word-end mark is drawn as an underscore and behaves as an ordinary symbol: it sits on its own tile at the start and gets merged into neighbouring letters like any other.',
      'Two counters run along the bottom, one for fragments and one for vocabulary, and they do not move together — at the settings of twelve and twenty-four merges the vocabulary reads twenty-three both times while the fragments drop from sixteen to eleven, because a merge can introduce one symbol and retire another.',
      'At the zero setting the closing caption changes its wording to say that every letter stands alone, rather than reporting a vocabulary.',
      'The five settings produce thirty-three, sixteen, eleven, nine and seven fragments, and the final row at the largest setting holds the sentence as whole words.',
    ],

    screen: {
      affordances: [
        'The handle is a five-position slider reading 0, 12, 24, 36 and 44, and it starts at 24 rather than at either end, so a reader can be moved in both directions from where the screen opens.',
        'Moving the handle replays the entire run at the new setting from the single-letter row, so each setting is watched being reached rather than merely displayed.',
        'Full playback control sits alongside it: play, single step, pause, reset and a speed slider.',
        'The corpus and the test sentence are fixed, so an article can quote the sentence itself, the five settings, and the fragment counts they produce.',
      ],
    },

    useWhen: [
      'The article states that a larger vocabulary yields shorter sequences and expects that to be taken on faith. Turning the handle makes the claim the reader\'s own action, and the row contracting against a mark planted at its original length is the evidence.',
      'The reader believes vocabulary size and sequence length are two names for one quantity. Two settings that report an identical vocabulary while the sequence keeps shrinking is the counterexample, and it needs the counters visible at the same instant.',
      'The prose is about structure appearing without anyone teaching it — a common ending falling out of raw frequency counts. Watching the rules arrive in the order the corpus ranked them is what turns that from an assertion into something witnessed.',
      'A reader has to weigh the decision itself rather than hear its outcome: every additional merge buys a shorter sequence and costs a larger symbol table, and the handle is that trade laid out at five points.',
    ],

    avoidWhen: [
      'The subject is how a single merge is chosen — counting adjacent pairs across a corpus, ranking them, breaking ties. The rules arrive already ranked here and the counting that produced them is never opened.',
      'The article is about what happens to a word the corpus never contained. Every word on this screen is divided successfully at every setting and nothing is ever rejected.',
      'The point is how the space between words is recorded so the text can be reassembled. The mark on this screen says a word has ended, which is a different job from saying one is about to begin.',
      'The subject is whether to cut at words or at characters at all. That question is settled before this screen starts, which opens at single letters and only ever joins them.',
      'The article is about a compiler dividing program text into units its grammar defined in advance. Nothing here is defined in advance; every unit was learned by counting.',
      'The article uses "vocabulary" for the set of words a model can produce, or for a glossary for human readers.',
    ],

    contrastWith: [
      {
        concept: 'betweenLetterAndWord',
        note: 'One asks how far to grow the vocabulary, the other asks what size of unit is wanted at all. This has an answer at every setting along a dial; that is a choice between three kinds of unit, and it has to be settled before this dial means anything.',
      },
      {
        concept: 'spaceIsPartOfIt',
        note: 'Both concern what the symbols are, but from opposite ends. This is about how many of them there are and what growing that number buys; that is about what has to be written into each one so the division can be undone.',
      },
      {
        concept: 'boundaryShift',
        note: 'Mirror images of the same dependency. Here the sentence is held still and the vocabulary varies, which yields a smooth and predictable trend; there the vocabulary is held still and the input varies, which yields no trend at all.',
      },
      {
        concept: 'tokenization',
        note: 'Same act of dividing text, opposite source of authority. There the units are fixed by a grammar written before any input is seen, so the division is decidable; here the units were learned from how often character sequences happened to co-occur, so the division is a property of the corpus rather than of the language.',
      },
    ],
  },
};

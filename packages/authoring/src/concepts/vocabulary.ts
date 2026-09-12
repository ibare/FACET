/**
 * vocabulary 개념 선언.
 *
 * canonical facet 은 `facet:vocabulary` — 완결형이다. 시험 낱말 여섯이 한 줄씩
 * 서고, 말뭉치 손잡이(everyday · biology · code)를 돌리면 그 말뭉치로 다시 학습해
 * 같은 여섯을 다시 자른다. 조각 경계마다 틈이 벌어지므로 글자가 실제로 좌우로
 * 미끄러진다. 계기 둘(조각 합계 · 어휘 크기)이 딸려 있고 코드 패널은 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **어휘를 갈아 끼우면 무엇이 달라지는가** 를 맡는다 — 어느 어휘도
 * 일률적으로 낫지 않다는 것. definition 의 주어가 "어휘 그 자체와 그것을 가르친
 * 말뭉치" 이고, keywords 도 말뭉치 · 도메인 적합 · 재학습 어휘만 갖는다.
 * 조각 `unknownBecomesKnown` 은 어휘 밖의 입력을 받아 내는 일만, 조각
 * `tokensPerLanguage` 는 어휘가 치우쳤을 때 치르는 값만 말한다. 셋이 같은 것을
 * 다루므로 서로의 낱말(거절 · 통째 · 언어 · 값)을 definition 에서 쓰지 않는다.
 *
 * ── id 를 `vocabulary` 로 둔 까닭과 그 위험
 *
 * `facet:<id>` 가 canonicalFacet 이 되어야 한다는 관행을 따랐다. 다만 이 낱말은
 * "어휘력" 이나 "용어집" 으로도 읽히므로, definition 이 **서브워드 토크나이저의
 * 조각 목록**임을 첫 구에서 못박고 avoidWhen 이 나머지 오독을 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const vocabularyConcept: FacetConceptSource = {
  id: 'vocabulary',
  label: 'Vocabulary (Which Corpus Taught a Tokenizer Its Pieces)',
  domain: 'ai-engineering',
  canonicalFacet: 'facet:vocabulary',

  surface: {
    definition:
      "A subword tokenizer's inventory of pieces, built from a training corpus: swap which corpus taught it and the same words come apart at different points, with no inventory better everywhere.",
    exemplarKeywords: [
      'subword vocabulary',
      'BPE vocabulary',
      'tokenizer trained on the wrong data',
      'domain-specific tokenizer',
      'vocabulary size',
      'code versus prose tokenizer',
      'retraining a tokenizer for a domain',
      'why one tokenizer splits a term and another keeps it',
      'the training text decides the pieces',
      'medical and legal terms shattered into fragments',
    ],
  },

  briefing: {
    observable: [
      'Six fixed test words sit one per row, each drawn as boxed symbols with the piece count and a length bar at the end of the row, so the same six can be compared across every setting of the handle.',
      'Moving the corpus handle re-learns the pieces and cuts the same six words again; gaps open at the new boundaries and the letters physically slide toward or away from each other, so a changed cut is a movement rather than a changed number.',
      'On the first corpus every word falls apart into single letters and the total reads 47, with the vocabulary size counter at 14.',
      'On the second corpus "genetic" collapses into a single piece while "numbers" stays at seven; on the third the two swap, "numbers" and "strings" landing at two each while "genetic" scatters into seven.',
      '"organism" reaches nine pieces on the third corpus — every letter plus the end mark, worse than the seven it got on the first — so a richer inventory is visibly not a better one for every word.',
      'Two corpora arrive at the identical total of 32 with identical vocabulary sizes of 28, and when the second of them settles the caption names the other one and states that the words each cuts well are opposite; that caption appears only when a corpus matches a total some earlier corpus already reached.',
      'A trailing "_" is drawn as its own cell on every row and counted as its own piece, so word-final pieces are visibly distinct from the same letters mid-word.',
      'Two counters below the canvas carry the piece total and the vocabulary size, and they show that corpus\'s values rather than accumulating as the handle is moved back and forth.',
    ],

    screen: {
      affordances: [
        'A segmented slider labelled Corpus offers everyday, biology and code; the screen cuts the six words once with everyday on arrival and then waits on that slider.',
        'Standard playback buttons and a speed slider sit beside the handle; they respond while a corpus is being cut, and once it settles into waiting it is the slider and reset that answer.',
        'The six words, the corpora and the merge count are all fixed, so an article can quote any number on the screen and name the word it belongs to.',
        'The comparison worth staging is between the two corpora that tie at 32, because reading only the totals hides that they are good at opposite words.',
      ],
    },

    useWhen: [
      'An article ranks tokenizers as though one were simply better, or says a tokenizer "knows" certain words. Two inventories tied at the same total while excelling at opposite words is what turns that ranking into a question of fit.',
      'The prose is about picking or retraining a tokenizer for a particular field, and the reader needs to see the fit coming from the text it was taught on rather than from how large it is.',
      'A reader is surprised that a familiar term arrives shattered into fragments; here a word survives whole under one setting of the handle and breaks into seven under another, with nothing else changed.',
    ],

    avoidWhen: [
      'The subject is how the pieces are learned — counting which pairs occur together and fusing the most frequent. That work is already finished each time the handle lands, and only its outcome is drawn.',
      'The article uses "vocabulary" for a person\'s word knowledge, a controlled glossary, or the standard terminology of a field.',
      'The point is what happens after the cut — how the pieces are embedded, or how a model attends over them. Nothing here goes past the cut.',
      'The article is about how many pieces a given text costs, or about the share of the input budget it takes. The totals here exist to be compared against each other, not to price anything.',
    ],

    contrastWith: [
      {
        concept: 'unknownBecomesKnown',
        note: 'Both turn on what an inventory holds, but replacing the inventory to see what moves is a different question from what becomes of an input the inventory lacks.',
      },
      {
        concept: 'tokensPerLanguage',
        note: 'That one charges the skew of a single inventory to the inputs it suits worst; this one denies that any inventory is uniformly better by exchanging one for another.',
      },
    ],
  },
};

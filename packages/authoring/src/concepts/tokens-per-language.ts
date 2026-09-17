/**
 * tokensPerLanguage 개념 선언.
 *
 * canonical facet 은 `facet:tokensPerLanguage` — 조각이다. 위에 어휘 띠, 아래에
 * 같은 뜻의 문장 다섯이 한 줄씩 선다. 줄을 자를 차례가 오면 조각 경계마다 틈이
 * 벌어져 글자가 오른쪽으로 밀리고, 줄 끝의 조각 수와 배수 표시도 함께 밀려난다.
 * 스스로 한 바퀴 재생하고 그 뒤로는 한 걸음씩 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **어휘가 한쪽에 치우쳤을 때 치르는 값** 이다 — 같은
 * 뜻인데 조각 수가 몇 배다. definition 의 주어가 "한 언어로 치우쳐 배운 조각들" 이고
 * keywords 도 값 · 문맥 창 · 다국어 어휘만 갖는다. 완제품 `vocabulary` 는 어휘를
 * 갈아 끼울 때 무엇이 달라지는지를, 조각 `unknownBecomesKnown` 은 어휘 밖의
 * 입력을 받아 내는 일을 맡으므로 그쪽 낱말(말뭉치 교체 · 거절 · 통째)은 쓰지 않는다.
 *
 * ── 화면의 수는 실측이다
 *
 * 영어 4 대 es 14 · pt 13 · id 12 · fr 10 은 선언된 말뭉치 48낱말을 예순 번
 * 병합해 나온 값을 다시 재어 확인했다. 어휘 조각은 54종이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tokensPerLanguageConcept: FacetConceptSource = {
  id: 'tokensPerLanguage',
  label: 'Tokens per Language (What a Lopsided Inventory Costs)',
  canonicalFacet: 'facet:tokensPerLanguage',

  surface: {
    definition:
      'Subword pieces learned mostly from one language make sentences of the same meaning in other languages break into several times as many pieces, so identical content costs more.',
    exemplarKeywords: [
      'token count by language',
      'non-English text costs more',
      'the context window fills faster',
      'price per token',
      'multilingual tokenizer fairness',
      'token inflation',
      'characters per token',
      'the same sentence costs more in one language',
      'tokenizer bias against a language',
      'multilingual LLM cost',
    ],
  },

  briefing: {
    observable: [
      'A band of fifty-four chips across the top is the entire inventory, learned from forty-eight English words, and it visibly mixes whole English words with short fragments of two and three letters.',
      'Five sentences that all mean the same thing appear below it as bare letters at equal starting positions, so the rows begin the same length and only the cutting separates them.',
      'Each row is cut in turn: gaps open at every piece boundary, the letters slide right, and the count at the end of the row is pushed right by exactly that much, so the extra length of a row is the extra pieces rather than a separate statistic.',
      'The English row does not move at all when it is cut — its four words are four pieces — while the Spanish row reaches fourteen pieces for fourteen letters, meaning every single letter stands alone.',
      'The remaining rows land between those two at thirteen, twelve and ten, and each row carries a multiple beside its count reading ×3.5, ×3.3, ×3.0 and ×2.5 against the English row.',
      'The Indonesian row is visibly less shattered than the Spanish one because two of its fragments survive as pieces that the English words happened to produce, showing the inventory matches letter sequences rather than knowing any language.',
      'A dashed line drops at the point where the English row ended, so how far each other row overhangs it is read off directly rather than from the numbers.',
      'The closing caption reports the fewest and the most pieces as four and fourteen while the letter counts of the five sentences stay between ten and fifteen.',
    ],

    screen: {
      affordances: [
        'The screen plays through on its own — inventory, then the five sentences, then one cut per row — and stops with the dashed line drawn.',
        'Beneath it are a Replay button and a playback strip. Once the run is over, dragging the handle to a single row holds its cut still so it can be compared with the one above.',
        'The sentences and the words the inventory was learned from are fixed, so an article can quote any count or multiple and name the language it belongs to.',
      ],
    },

    useWhen: [
      'An article mentions that some languages are more expensive per unit of text and the reader takes it for a rounding difference. Four against fourteen for one sentence of a single meaning is the actual size of the gap.',
      'A reader budgeting a context window or an invoice assumes the letter count and the piece count move together; here the letters stay between ten and fifteen while the pieces spread from four to fourteen.',
      'The prose needs the reason behind the gap rather than the fact of it, and the row that fares best after English does so because of fragments that arrived by coincidence rather than by design.',
    ],

    avoidWhen: [
      'The subject is how well a model writes, reasons or answers in a language. Nothing on this screen goes past the cut, and a short row is not a better-served language in any other sense.',
      'The article is about scripts without spaces between words, or writing systems outside the Latin alphabet. Every sentence here is Latin letters separated by spaces.',
      'The point is translation quality, or whether the five sentences truly carry the same meaning. Their sameness is a premise rather than something demonstrated.',
      'The article is about a word that arrives in a form the pieces never covered. Every sentence here is made of ordinary words, and what varies is how finely each one is divided.',
    ],

    contrastWith: [
      {
        concept: 'vocabulary',
        note: 'Both come of an inventory suiting some inputs better than others, but weighing one inventory against another is different from charging the skew of a single one to the inputs it suits worst.',
      },
      {
        concept: 'unknownBecomesKnown',
        note: 'Dividing an input finely is the remedy there and the bill here: nothing is refused either way, but this counts what the division costs.',
      },
    ],
  },
};

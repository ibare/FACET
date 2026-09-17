/**
 * mergeTheFrequentPair 개념 선언.
 *
 * canonical facet 은 `facet:mergeTheFrequentPair` — 조각(piece)이다. 낱말 넷이
 * 배수와 함께 왼쪽에 서고, 낱글자 조각 사이의 이음매마다 그 짝이 말뭉치 전체에서
 * 붙은 횟수가 적힌다. 다섯 걸음 동안 가장 무거운 이음매가 네 줄에서 한꺼번에
 * 닫힌다 (`s+t`=18 → `a+st`=14 → `f+ast`=11 → `fast+e`=6 → `fast+</w>`=5).
 * 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `bpeTraining` 과 한 묶음이다. 둘 다 짝을 합쳐 어휘를 만드는 일을 다루므로
 * definition 이 같아지기 쉬웠다. 가른 자리는 **주어의 층위**다.
 *
 * 이 조각의 주어는 **되풀이되는 한 걸음**이다 — 세고, 가장 무거운 것을 고르고,
 * 그것이 있는 자리를 모두 닫고, 다시 센다. 말뭉치는 처음부터 끝까지 그대로다.
 * 완제품의 주어는 말뭉치와 어휘의 관계이므로, 이쪽 definition 은 `corpus` ·
 * `frequent` · `rare` · `vocabulary` 를 한 번도 쓰지 않는다. 이쪽이 쥔 말은
 * `unchanging body` · `tally` · `begins again` 이다.
 *
 * 이웃 개념 `tokenization` 은 컴파일러의 렉싱이라 이름만 닮았다. 그쪽이 쥔 말
 * (`lexer` · `scanner` · `maximal munch` · `compiler front end` · `token`) 은
 * 여기 definition 에 0 건이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mergeTheFrequentPairConcept: FacetConceptSource = {
  id: 'mergeTheFrequentPair',
  label: 'Merge the Frequent Pair (One Turn of Building Up Pieces)',
  canonicalFacet: 'facet:mergeTheFrequentPair',

  surface: {
    definition:
      'A repeated step over one unchanging body of words: every adjacent pair of pieces is tallied across the whole body, the highest-tallied pair becomes a single piece everywhere it sits, and the tallying begins again.',
    exemplarKeywords: [
      'how does byte pair encoding merge pairs',
      'most frequent adjacent pair',
      'count the pairs then combine the top one',
      'BPE merge step',
      'end-of-word marker',
      'every occurrence closes at once',
      'a fragment shared between unrelated words',
      'from single letters to longer pieces',
      'repeat until the merge budget runs out',
    ],
  },

  briefing: {
    observable: [
      'The tally for each pair is written on the gap it belongs to rather than collected in a panel at the side, so the same number appears several times over — once at every gap where that pair sits.',
      'Four words are stacked with their left edges aligned and their letters on a fixed grid, so the gap that is about to close lines up as a column and the reader sees four rows close together in one movement.',
      'Before a pair closes, its two chips lean a few pixels toward each other while the tally on that gap is drawn in heavier ink than the rest, so the choice is shown before its consequence.',
      'The word multipliers do the weighting in the open: a gap inside the word marked four is worth four, which is how the first winning gap reaches eighteen from only four words.',
      'Every piece that has been produced by a merge is filled differently from a plain letter, so the stock of pieces accumulated so far can be read off the rows as colour.',
      'The winning tallies fall as the run proceeds — eighteen, then fourteen, eleven, six, five — so later merges are visibly built on rarer material than earlier ones.',
      'The fourth word shares no opening letter with the other three yet ends up holding a middle fragment that all four have in common, which is a fragment appearing in words that look unrelated.',
      'The end marker is a chip of its own from the very first beat, is tallied like any letter, and is eventually swallowed into a merge like any other neighbour.',
      'The closing caption states how many merges were performed and how many distinct pieces remain, and those two numbers are different.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole run by itself and stops after the last merge with the closing count on display.',
        'Two buttons: Replay, and a step control that rewinds to the split letters and walks the same run one beat at a time, where each merge is two beats — the tallies appearing, then the gap closing.',
        'The four words and their multipliers are fixed, so an article can name them and quote any tally on the screen.',
        'The beat worth stopping on is the one where the tallies are up but nothing has closed yet, because that is where the comparison that decides the merge is visible.',
      ],
    },

    useWhen: [
      'The prose says the most frequent pair is merged and the reader pictures it happening inside a single word. One gap closing simultaneously down four aligned rows is what moves the operation from the word to the body of words.',
      'A reader wants to check the arithmetic instead of taking it on faith. Every gap carries its own tally and every word carries its multiplier, so the eighteen on the first winning gap can be added up by hand from what is on the screen.',
      'The article claims the resulting pieces are not arbitrary, and the reader needs to see a fragment emerge that no one wrote down — one that turns up in a word sharing nothing else with the rest.',
    ],

    avoidWhen: [
      'The subject is applying an already-built stock of pieces to a word never seen before. This stops at the point where the pieces exist and never cuts anything up with them.',
      'The article is about what to do when two pairs are equally heavy. These four words were chosen so that the leader is unique at every step, and that comparison never comes up here.',
      'The point is how many merges to perform, or how the size of the final stock is chosen. The number of steps here is fixed and the screen has no say in it.',
      'The article uses "merge" for combining branches in version control, joining records, or interleaving two sorted runs.',
    ],

    contrastWith: [
      {
        concept: 'bpeTraining',
        note: 'This asks what one turn of the operation does and how the counting settles it; that asks what the body of words has to contain for one result rather than another to come out, which is a question this one holds still by construction.',
      },
      {
        concept: 'tokenization',
        note: 'Both end with text divided into pieces, but there the rules for where to cut are written by hand before any text is seen, while here nothing is decided in advance and the divisions are derived from what the material itself repeats.',
      },
    ],
  },
};

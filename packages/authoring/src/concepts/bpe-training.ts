/**
 * bpeTraining 개념 선언.
 *
 * canonical facet 은 `facet:bpeTraining` — 완제품이다. 왼쪽에 낱말 여섯과 그 횟수,
 * 오른쪽에 짝 빈도 순위표, 아래에 배운 병합 여섯 칸이 있다. 손잡이는 낱말 하나
 * (`sing`)의 빈도를 2 · 5 · 8 · 12 · 18 로 옮기는 분절 슬라이더이고, 나머지 다섯
 * 낱말의 횟수는 고정이다. 재생 묶음과 계기 둘이 딸려 있고 코드 패널은 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 `mergeTheFrequentPair` 와 한 묶음이다. 가른 자리는 **주어의 층위**다.
 *
 * 조각의 주어는 되풀이되는 한 걸음이고, 이 완제품의 주어는 **말뭉치와 어휘의
 * 관계**다 — 어휘는 누가 정해 준 목록이 아니라 말뭉치가 무엇을 자주 보았느냐의
 * 자국이라는 주장. 그래서 이쪽 definition 은 셈의 절차어(`tally` · `adjacent` ·
 * `begins again`)를 한 번도 쓰지 않고, 대신 `corpus` · `how often` · `rare` ·
 * `frequent` · `vocabulary` 를 쥔다.
 *
 * 이웃 개념 `tokenization` 은 컴파일러의 렉싱이라 이름만 닮았다. 그쪽이 쥔 말
 * (`lexer` · `scanner` · `maximal munch` · `compiler front end` · `token`) 은
 * 여기 definition 에 0 건이다.
 *
 * ── 화면을 정독하다 잰 것
 *
 * 다섯 손잡이 값을 독립으로 다시 셈해 보니 계기 `pieces in use` 의 마지막 값이
 * 다섯 값 모두 같았다 (9). 손잡이가 바꾸는 것은 조각의 **수**가 아니라 **어느
 * 조각이냐**라는 뜻이라, 이 개념의 주장을 그대로 받치는 관찰이어서 observable 에
 * 적었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bpeTrainingConcept: FacetConceptSource = {
  id: 'bpeTraining',
  label: 'BPE Training (Why a Vocabulary Holds What It Holds)',
  domain: 'ai-engineering',
  canonicalFacet: 'facet:bpeTraining',

  surface: {
    definition:
      'Why a subword vocabulary holds the entries it holds: how often each word appears in a corpus decides what gets combined first, so rare words stay in fragments while frequent ones become single entries.',
    exemplarKeywords: [
      'why does the vocabulary contain this entry and not another',
      'byte pair encoding training',
      'the vocabulary reflects the training data',
      'domain-specific vocabulary',
      'rare words get broken into many fragments',
      'common words survive whole',
      'two models split the same word differently',
      'vocabulary is learned rather than designed',
      'corpus frequency decides the merge order',
      'what happens to words the data rarely contains',
    ],
  },

  briefing: {
    observable: [
      'The ranking on the right is the part that moves: rows carry a bar and a number and slide to new ranks, and a row pushed below the visible rows sinks out of sight instead of being destroyed, so it can climb back up when the handle is turned.',
      'Turning the handle changes one word\'s count in the left column and restarts the run from the first step, so the reader watches the same six slots fill in a different order rather than seeing a new picture appear.',
      'At the two lowest settings the handle word never wins a merge, and the closing caption says so outright, naming the fragments it is left in; the counter for the step at which it became whole reads zero, which is how "it never did" is shown.',
      'At the middle setting the handle word is completed in the very last slot, and at the two highest it is completed fourth, pushing two merges that used to come earlier down the row.',
      'The merge that would complete the handle word is drawn in a distinct colour both while it is climbing the ranking and after it lands in the bottom row, so it can be tracked before it wins.',
      'At the lowest settings the final slot goes to a different word entirely, which ends up whole in place of the handle word — the screen shows a substitution, not just an absence.',
      'The counter for pieces in use ends on the same value at every setting of the handle: what the handle changes is which pieces exist, not how many.',
      'When several pairs tie for the lead the caption says the alphabetically first one wins, so the reader is told there is a rule for ties rather than being left with an arbitrary pick.',
      'The end-of-word marker is drawn as an underscore and is combined like any other symbol, so entries ending in it appear in the bottom row alongside ordinary ones.',
    ],

    screen: {
      affordances: [
        'On mount the screen plays six steps at the default handle setting and then waits, so something complete is on the screen before the reader touches anything.',
        'Full playback is available — play, single step, pause, reset, and a speed slider — which is how a reader can hold the ranking still and read it before the next step disturbs it.',
        'The handle is a segmented slider over five settings for how often one named word occurs; the other five words keep their counts, so any change in the outcome has exactly one cause.',
        'Two counters sit with the controls: how many pieces are in use, and the step at which the handle word became whole.',
        'The comparison that carries the argument is between an adjacent pair of settings rather than any single one, because the point is what moved when only the count moved.',
      ],
    },

    useWhen: [
      'The article shows a real vocabulary and the reader assumes a person curated it, or that it reflects something about the language itself. Moving one count and watching the order of results rearrange puts the cause in the material instead.',
      'A reader believes a word is one entry because it is a word. Here a single word is left in fragments at low settings and whole at high ones, without its spelling ever changing, so being a word is not what settles it.',
      'The prose needs to explain why two systems built the same way disagree about how to break up the same word, and the honest answer is that they read different material.',
      'Someone is about to treat a poor result on specialist text as a flaw in the method. The screen locates it in what the material contained, by showing a word that is rare in this material staying broken up.',
    ],

    avoidWhen: [
      'The subject is applying a finished vocabulary to text it has never seen. Everything here happens while the vocabulary is still being formed.',
      'The article is about how large a vocabulary should be, or the cost of making it bigger. The number of steps is fixed on this screen and is not what the handle controls.',
      'The point is the arithmetic of a single step — how the pairs are counted and the leader picked. The ranking is on screen but the argument here is about what it is a ranking of.',
      'The article uses "training" for fitting parameters against a loss, or "frequency" in the sense of signals and sampling. Nothing here is optimised and nothing oscillates.',
    ],

    contrastWith: [
      {
        concept: 'mergeTheFrequentPair',
        note: 'That takes the material as given and asks what the operation does to it; this takes the operation as given and asks what the material has to be for one outcome rather than another, which is the question that turns a procedure into an explanation.',
      },
      {
        concept: 'tokenization',
        note: 'Both concern text arriving in pieces, but there the boundaries follow rules an author fixed in advance and are the same for every input, while here no boundary is chosen by anyone and the divisions are an artefact of what the material happened to repeat.',
      },
    ],
  },
};

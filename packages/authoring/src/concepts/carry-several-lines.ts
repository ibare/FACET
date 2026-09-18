/**
 * carrySeveralLines 개념 선언.
 *
 * canonical facet 은 `facet:carrySeveralLines` — 조각이다. 프롬프트 `The` 에서 토큰 셋을
 * 만든다. 빔 폭은 2 로 고정이다. 깊이마다 세로 한 열이고, 열 안의 자리가 순위다 — 위 두
 * 칸이 남은 줄, 틈 아래가 끊긴 줄. 펼칠 때 가지가 부모 자리에서 뻗어 나오고, 솎을 때
 * 순위 칸으로 옮겨 앉는다. 마지막에 폭 1 로 돈 탐욕의 줄과 견준다. 스스로 한 번 재생하고
 * 그 뒤로는 되감아 짚는다.
 *
 * ── 화면의 수 (다시 재어 확인)
 *
 * 걸음 1: The nice −0.74 · The dog −0.94 · The car −2.04 (셋 중 둘 남음)
 * 걸음 2: The dog has −1.11 이 1 등 — 한 걸음 전 2 등의 자식이 앞선다 (여섯 중 둘)
 * 걸음 3: The dog has a −1.70 (p 0.18) 1 등, 탐욕의 줄 The nice woman is −2.54 (p 0.08)
 *         는 순위 3 으로 끊긴다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **2 등 줄이 한 걸음 뒤 1 등을 앞지르는 사건** 이다. 주어가
 * "앞선 줄 곁에 2 등 줄을 살려 두는 것" 이고 어휘는 runner-up · overtake · greedy ·
 * summed log probability 다. 완제품 `beamSearch` 의 폭 손잡이 어휘(wide · width ·
 * 비용)와 `eraseTheImpossible` 의 어휘(grammar · forbid · share)는 쓰지 않았다 —
 * 이 화면에는 폭을 옮기는 손잡이도 지우는 판정도 없다.
 *
 * ── 전제
 *
 * 로짓은 예로 정한 값이다. 모형은 앞 문맥 전체를 열쇠로 한 다섯 문맥뿐이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const carrySeveralLinesConcept: FacetConceptSource = {
  id: 'carrySeveralLines',
  label: 'Carry Several Lines (The Runner-Up Overtakes)',
  canonicalFacet: 'facet:carrySeveralLines',

  surface: {
    definition:
      'Keeping the second-ranked prefix alive beside the leader lets it overtake once its next token proves far likelier, recovering a higher summed log probability than greedy decoding, which dropped it.',
    exemplarKeywords: [
      'why beam search beats greedy decoding',
      'greedy decoding misses the better sentence',
      'second best continuation wins later',
      'cumulative log probability of a sequence',
      'sum of log probabilities',
      'a locally worse token leads to a better sequence',
      'keep the top two hypotheses',
      'hypotheses ranked by score',
      'expand then prune',
    ],
  },

  briefing: {
    observable: [
      'Each depth is one column, and position inside a column is rank: the top two slots are the lines that survive, and below a gap sit the lines that were cut. Branches grow out of their parent and then slide into the slot their rank earns.',
      'At the first token "The nice" leads at −0.74 with "The dog" just behind at −0.94; "The car" at −2.04 is cut. Every score is a running sum of natural log probabilities, shown with two decimals and a probability beside it.',
      'At the second token the two kept lines branch into six, and "The dog has" at −1.11 moves into the top slot. The caption says outright that the line ranked second a step earlier now leads.',
      'At the third token "The dog has a" finishes first at −1.70 (p 0.18). The line a one-at-a-time choice would have produced, "The nice woman is" at −2.54 (p 0.08), ranks third and is cut, and the closing caption names both, so the beam\'s sentence is more than twice as likely.',
      'Cut branches do not vanish: their links retreat halfway toward the parent and stay, so the whole set of alternatives considered remains on screen at the end.',
      'The logits are values fixed for the example, not the output of a real language model, and the model knows only five contexts, exactly the ones this run and the one-at-a-time run open.',
    ],

    screen: {
      affordances: [
        'The screen plays through by itself — prompt, three rounds of branching and culling, then the comparison — and stops on the comparison.',
        'Below it are a Replay button and a playback strip; after the run, dragging the strip holds any branching or culling still.',
        'The prompt, the width of two and the logits are fixed, so an article can quote any score or rank shown.',
      ],
    },

    useWhen: [
      'The article claims that choosing the most likely token each time can miss the most likely sentence, and the reader needs the moment it happens: a line in second place after one token leads after two.',
      'A reader thinks a sentence\'s likelihood is judged token by token; the ranking here is by a running sum, and "has" at a high probability is what lifts a line that started behind.',
      'The prose explains what "expand, then prune" means inside a beam decoder and needs a small run in which every branch and every cut can be counted: three, then six, then six, with two kept each time.',
    ],

    avoidWhen: [
      'The article is about choosing the beam size or what widening costs. Two lines are carried throughout and nothing here varies it.',
      'The subject is forcing output into a format or ruling out tokens by rule. Every candidate here is allowed and is only ranked.',
      'The subject is sampling or temperature. Nothing is drawn at random; the same run plays every time.',
      'The point concerns length normalisation or penalties for longer outputs. All lines here have the same length and scores are plain sums.',
      'The article draws conclusions about a real model. The logits are invented for the example.',
    ],

    contrastWith: [
      {
        concept: 'beamSearch',
        note: 'This makes the case that a second kept candidate can win later; beam search as a whole asks how many must be kept before the best sentence is reliably found and what each extra one costs.',
      },
      {
        concept: 'alwaysTheHighest',
        note: 'One commits to the top token and never reconsiders; this keeps a rival alive precisely because the top token at one step says little about the step after.',
      },
      {
        concept: 'greedyDecoding',
        note: 'That is the rule being corrected: one continuation per step. The claim here is only that holding a second one is enough, in this case, to reach a sentence more than twice as likely.',
      },
      {
        concept: 'eraseTheImpossible',
        note: 'Both change which output comes out of the same probabilities, but here nothing is removed and the gain comes from looking one step further, while there nothing is looked ahead and the gain comes from removal.',
      },
      {
        concept: 'greedyCanFail',
        note: 'Both turn on an early best choice that makes the whole worse; that one presents the failure, and this one keeps a runner-up so the failure can be undone a step later.',
      },
    ],
  },
};

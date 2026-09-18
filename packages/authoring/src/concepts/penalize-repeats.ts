/**
 * penalizeRepeats 개념 선언.
 *
 * canonical facet 은 `facet:penalizeRepeats` — 조각이다. 위에 앞 문맥
 * `the cat sat on the mat and the cat` 이 낱말 조각으로 늘어서고, 아래 로짓 사다리
 * 하나에 후보 다섯(sat 2.4 · ran 2.1 · slept 1.2 · jumped 0.5 · the −0.8)이 제 높이로
 * 매달린다. 문맥에 나온 sat 과 the 만 차례로 깎여 내려가고, 소프트맥스를 다시 셈하면
 * 1 등 표지가 sat 에서 ran 으로 옮겨 간다. the 옆에는 거꾸로 나눴다면 올라갔을 자리가
 * 붉은 틀로 선다. 스스로 한 바퀴 재생하고 그 뒤로는 되감아 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **골라서 깎는 식과 그 부호 규칙**, 그리고 **1 등이 바뀌는
 * 것**이다. definition 의 꼬리 "앞서는 후보가 바뀔 수 있다" 는 `flattenOrSharpen` 의
 * 꼬리 "앞서는 후보는 바뀌지 않는다" 와 정확히 엇갈린다 (마주 보는 짝).
 *
 * 어휘 배타: temperature · softmax 는 형제 조각에, draw · random · sample · variety 는
 * 완제품에 두고 여기 definition 에는 쓰지 않았다 (기계 확인 0 건). "repetition penalty"
 * 라는 이름은 완제품이 손잡이 이름으로 definition 에 쥐고 있어, 여기서는 keywords 로만
 * 받는다 — definition 은 이름 대신 식을 말한다.
 *
 * ── 전제
 *
 * 로짓은 예로 정한 값이다. 문맥은 공백으로 가른 낱말이지 하위 낱말 토큰이 아니고,
 * 세 번 나온 the 도 한 번만 깎인다. θ 는 1.3 하나로 고정이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const penalizeRepeatsConcept: FacetConceptSource = {
  id: 'penalizeRepeats',
  label: 'Penalize Repeats (Cutting the Scores of Words Already Written)',
  canonicalFacet: 'facet:penalizeRepeats',

  surface: {
    definition:
      'Candidates that already appear in the preceding text have their logits lowered once — positive ones divided by a factor, negative ones multiplied by it — so the leading candidate can change.',
    exemplarKeywords: [
      'repetition penalty',
      'CTRL repetition penalty',
      'stop the model from repeating words',
      'penalizing tokens already generated',
      'why dividing a negative logit is wrong',
      'repetition_penalty parameter',
      'degenerate repetition in text generation',
      'the model loops on the same phrase',
      'discouraging reuse of earlier words',
      'logit adjustment before the next word',
    ],
  },

  briefing: {
    observable: [
      'The preceding text sits at the top as separate word chips under the heading "Already written", and five candidates hang on one vertical logit scale at their own heights, each with its value and its probability beside it.',
      'Before any cut, sat leads with probability 0.45 and ran is second at 2.1 against sat\'s 2.4.',
      'Only the candidates found in the text above are touched, in list order: sat first, 2.4 ÷ 1.3 = 1.85, sliding down past ran; then the, −0.8 × 1.3 = −1.04, sinking further. ran, slept and jumped do not move.',
      'While scores are being cut the probability column shows dashes, because those probabilities belong to scores that no longer hold; they return only after softmax is taken again.',
      'The last step moves the top marker from sat to ran, which now leads with probability 0.41.',
      'In a lane to the right, when the is cut, a dashed red frame labelled "if ÷ 1.3 instead" stands at −0.62, above where it started, showing that dividing a negative score would have rewarded the word instead of penalising it.',
      'the occurs three times in the text above and is still cut only once, by the same amount as a word that appeared a single time.',
      'All five logits are invented for the example and are not the output of a real model.',
    ],

    screen: {
      affordances: [
        'The screen plays through on its own — the starting leader, one cut per matched candidate, then the new leader — and stops there.',
        'Beneath it are a Replay button and a playback strip; after the run, dragging the strip back to a single cut holds that moment, dashes included.',
        'The text, the five candidates, their logits and the factor 1.3 are fixed, so an article can quote any calculation exactly as it appears in the caption.',
      ],
    },

    useWhen: [
      'An article describes a repetition penalty as "dividing the logit" and the reader needs to see why a negative score has to be multiplied instead — the red frame at −0.62 shows the reward a naive division would give.',
      'A reader wonders how a small factor like 1.3 can matter; here it is enough to drop the leading word below its runner-up, because the two were only 0.3 apart.',
      'The prose needs to say that the penalty depends on whether a word appeared, not how often, and the word that appears three times is cut exactly once.',
    ],

    avoidWhen: [
      'The article is about frequency or presence penalties that subtract a fixed amount, or an amount that grows with the count. The cut here is a division or multiplication, applied once.',
      'The subject is how varied generated text becomes over many choices. Nothing is drawn at random here; the screen ends by naming a single leader.',
      'The article is about blocking repeated n-grams or banning words outright. Every candidate stays in the list with a finite score.',
      'The article needs a real model\'s figures, or works with subword tokens. The logits are chosen for the example and the text is split into whole words on spaces.',
    ],

    contrastWith: [
      {
        concept: 'flattenOrSharpen',
        note: 'Both adjust scores before softmax, but rescaling every candidate by the same number cannot reorder them, while cutting only the ones already used exists in order to reorder them.',
      },
      {
        concept: 'temperatureSampling',
        note: 'This settles what one cut does to one ranking; the other asks what the same cut does across many random draws, where its strength changes how the second setting behaves.',
      },
      {
        concept: 'alwaysTheHighest',
        note: 'Always taking the top candidate is what makes repetition inevitable when the top candidate is a word already used; this changes the scores so that the same rule lands elsewhere.',
      },
      {
        concept: 'cutTheTail',
        note: 'Removing candidates by their rank ignores what came before; lowering them by their history keeps every candidate eligible and lets the text so far decide who loses ground.',
      },
    ],
  },
};

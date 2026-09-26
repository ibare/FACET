/**
 * carryVelocity 개념 선언.
 *
 * canonical facet 은 `facet:carryVelocity` — 비탈(g −1) · 평지(g 0) · 비탈로 꺾인 장난감 선에서 β 0.9 · η 0.2 로 모멘텀
 * 갱신을 여덟 번 한다. 한 움직임 v 가 "이어 받은 몫 β·v" 와 "새로 민 몫 −η·g" 두 토막으로 한 줄씩 쌓이고, 평지 갱신
 * 넷(#4 ~ #7)에서는 새로 민 몫이 0 인데 w 가 1.61 · 2.05 · 2.44 · 2.80 으로 계속 가서 다음 비탈에 닿는다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `momentum` 은 β 를 돌려 "서는가 대 출렁이는가" 의 맞바꿈을 쥔다. 이쪽은 **기울기가 0 인 자리를 이어 받은
 * 몫만으로 건너는 장면** 하나다 — 곡선에 그릇이 없어 넘어섬은 없다. definition 은 decayed share of the previous
 * movement · zero-gradient plateau · keeps moving · where plain descent stops 를 쥐고, 완제품의 coefficient ·
 * trade-off · overshoot · oscillate · settle 을 쓰지 않는다.
 *
 * 전제: 손실은 장난감 꺾인 선(w < 1.1 에서 3 − w · 1.1 ~ 2.5 에서 1.9 · 2.5 이상에서 4.4 − w)이다. β · η · 처음 값은
 * 손으로 고른 값이다. 표시는 둘째 자리라 앞 두 수를 더한 것과 세 번째 수의 끝자리가 다를 수 있다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const carryVelocityConcept: FacetConceptSource = {
  id: 'carryVelocity',
  label: 'Momentum Carries Velocity Across a Flat Region',
  canonicalFacet: 'facet:carryVelocity',

  surface: {
    definition:
      'With momentum each update adds a decayed share of the previous movement to the current gradient push, so the weight keeps moving across a zero-gradient plateau where plain gradient descent would halt.',
    exemplarKeywords: [
      'momentum velocity term',
      'v ← β·v − η·g',
      'velocity accumulates',
      'crossing a plateau',
      'flat region of the loss',
      'zero gradient',
      'exponentially decaying average of past updates',
      'why momentum helps',
      'heavy ball intuition',
    ],
  },

  briefing: {
    observable: [
      'A strip of the loss marks three stretches, "slope · g −1.00", "flat · g 0.00" and "slope · g −1.00", with boundaries at 1.10 and 2.50. The rule `v ← β·v − η·g · w ← w + v` and "β 0.90 · η 0.20" sit above.',
      'Below, each update adds a row: a grey "β·v" segment (carried β·v), an orange "−η·g" segment (new push −η·g) and their sum "v". Each new row starts from the previous row\'s whole movement, shrunk by β.',
      'The first three updates are on the slope: the new push is 0.20 each time while the carried part grows 0.00 → 0.18 → 0.34, so the movement grows 0.20 → 0.38 → 0.54. The third update brings w to 1.12, onto the flat.',
      'Updates 4 to 7 are on the flat: the new push is 0.00, yet w goes on to 1.61 · 2.05 · 2.44 · 2.80 while the carried movement shrinks by 0.9 each time (0.49 · 0.44 · 0.40 · 0.36). The loss reads 1.90 while w is on the flat.',
      'The seventh update leaves the flat; on the eighth the new push of 0.20 returns: "Carried β × 0.36 = 0.32 · New push 0.20 → w 3.32", loss 1.08. v stays positive at every update, so w never moves backward.',
      'The loss is a toy bent line and β 0.9, η 0.2 and the start at 0 are chosen values. Numbers show two decimals and are each computed at full precision, so the displayed parts may not add exactly to the displayed sum (the third carried part is 0.342).',
    ],

    screen: {
      affordances: [
        'The screen plays nine steps by itself — the start and eight updates — and stops.',
        'A Replay button and a playback strip sit below. Dragging through updates 4 to 7 shows rows with no orange segment while w keeps advancing.',
        'All values are fixed, so an article can quote every carried part, push and position exactly.',
      ],
    },

    useWhen: [
      'The reader has learned that the update is proportional to the gradient and so expects any zero-gradient region to stop training; four updates here move w with a push of exactly zero.',
      'The article introduces the velocity term in momentum and needs its two parts — what is carried and what is newly added — shown separately, update by update.',
    ],

    avoidWhen: [
      'The article is about choosing the momentum value or about overshooting the minimum. One β is used and there is no bottom to pass.',
      'The subject is saddle points in many dimensions. The weight is one number on a hand-built line.',
      'The point is Adam or other adaptive methods that rescale each weight\'s step.',
    ],

    contrastWith: [
      {
        concept: 'momentum',
        note: 'Carrying movement across a flat stretch is the benefit; that the carried part also pushes past the minimum, and how the coefficient balances the two, is the trade-off built on it.',
      },
      {
        concept: 'localMinimum',
        note: 'Descent that follows only the current slope stops wherever the slope gives out; carrying earlier movement removes that particular reason to stop.',
      },
      {
        concept: 'perParameterStep',
        note: 'Momentum changes a step using the history of the same weight\'s movement; per-weight step sizes change it using the size of each weight\'s gradient.',
      },
    ],
  },
};

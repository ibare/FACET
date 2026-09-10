/**
 * projectAndLose 개념 선언.
 *
 * canonical facet 은 `facet:projectAndLose` — 이미 찾아 놓은 축 하나에 점 열둘이
 * 셋씩 네 무리로 수직으로 떨어지고, 떨어진 거리가 붉은 흔적으로 남았다가
 * 지워지는 조각이다. 자동으로 한 호흡 돌고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 축을 **찾는** 일은 `directionOfMostSpread` 가, 답이 무엇에 매여 있는지는
 * 완제품 `pca` 가 말한다. 여기서는 축을 주어진 것으로 두고 **내려 찍는 그
 * 순간에 무엇이 사라지는가** 만 무게중심에 둔다 — 되돌릴 수 없음, 떨어진
 * 거리의 크기, 담은 몫과 잃은 몫.
 *
 * keywords 도 사영과 손실 쪽 어휘만 가져간다. "가장 넓은 방향" · "분산이 각도에
 * 따라 변한다" 는 이웃 조각 몫이고, PCA 실무 어휘는 완제품 몫이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const projectAndLoseConcept: FacetConceptSource = {
  id: 'projectAndLose',
  label: 'Projecting Onto an Axis (What the Drop Discards)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:projectAndLose',

  surface: {
    definition:
      'Dropping each point perpendicularly onto a chosen line keeps its position along the line and discards its distance from it, which cannot be recovered afterwards.',
    exemplarKeywords: [
      'projection onto a line',
      'the foot of the perpendicular',
      'lossy',
      'reconstruction error',
      'residual after projecting',
      'information lost by reducing a dimension',
      'you cannot get the original back',
      'two numbers become one',
      'many different points land on the same spot',
      'the share the axis keeps',
    ],
  },

  briefing: {
    observable: [
      'The axis arrives already placed through the centre of the twelve points and stays exactly where it is for the whole run, so every beat of the screen is about the drop.',
      'Points fall three at a time, ordered by where they sit along the axis, so the drops sweep from one end of the line to the other rather than happening at random.',
      'Both directions are drawn at the same scale, so the right angle of each drop is a real right angle and the lengths can be compared by eye.',
      'The drop lengths stay on screen in red once landed, and a caption names the farthest one at 1.24 and the average at 0.70 while they are all still visible.',
      'The traces are then pulled into the axis and erased, leaving twelve spots on a line and nothing else — the erasure is a beat of its own rather than a scene change.',
      'A bar splits the total into the share the axis kept, 80.9 percent, and the share lost, 19.1 percent.',
      'At the end a row of candidate positions is drawn perpendicular through one spot, and every one of them lands on that same spot, so the spot answers to all of them equally.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole drop once on its own and stops with the spots on the line.',
        'Two buttons: Replay, and one step at a time, which is how to hold the screen at the moment the red traces exist and before they are erased.',
        'The twelve points and the angle of the axis are fixed, so the two distances and the two percentages an article quotes are what the reader will read.',
      ],
    },

    useWhen: [
      'The article calls a reduction "compression" and the reader expects the original to be recoverable in principle. The row of candidates collapsing onto one spot is where that expectation has to break.',
      'A percentage of variance kept has been quoted and the remaining percent is an abstraction. Here the discarded part is on screen as measured lengths first, and is erased second, so the number has something behind it.',
      'The reader accepts that a projection is perpendicular but has not connected the perpendicular distance to the thing being thrown away. The drop length is literally both here.',
    ],

    avoidWhen: [
      'The subject is choosing the line — why one direction is better than another, or how it is found. The axis here is handed over already placed.',
      'The article means projection in the sense of a forecast, a projected budget, or a figure in a plan.',
      'The subject is lossless compression, encoding or serialisation, where the original is recoverable by construction.',
      'The subject is the algebra of projection operators — projection matrices, idempotence, orthogonal complements. Only the geometry of a single drop appears here.',
    ],

    contrastWith: [
      {
        concept: 'directionOfMostSpread',
        note: 'That piece is the choice of line and stops before anything is dropped; this begins with the line settled and is entirely about what the drop costs.',
      },
      {
        concept: 'pca',
        note: 'There the kept share is one column of a ledger built to compare two runs; here it is the whole subject, standing next to the distances it summarises.',
      },
      {
        concept: 'residualDistance',
        note: 'Both measure how far a point sits from a line, but a residual is the error a fit is trying to shrink, while this distance is simply discarded once the axis is chosen.',
      },
      {
        concept: 'tsne',
        note: 'Both give up dimensions, but a straight drop loses exactly the perpendicular component and can be quantified, while a neighbourhood embedding trades away distances that cannot be named as a single share.',
      },
    ],
  },
};

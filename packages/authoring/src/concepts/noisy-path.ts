/**
 * noisyPath 개념 선언.
 *
 * canonical facet 은 `facet:noisyPath` — 점 다섯에 직선 ŷ = w·x + b 를 맞추며, 갱신마다 뽑힌 점 하나의 기울기로만
 * (w, b) 를 옮긴다. 갱신마다 전체 내리막(회색 점선)과 이 점의 내리막(주황) 사이의 각이 서고, 그 각은 33° · −30° ·
 * −49° · 35° · 44° · 5° · −135° · −16° 로 부호가 세 번 바뀐다. 일곱 번째 갱신에 전체 손실이 0.14 → 0.18 로 오르지만
 * 여덟 번 뒤 4.41 → 0.13 이다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `sgd` 는 묶음 크기를 돌려 비낌의 평균과 갱신 수가 함께 바뀌는 것을, 조각 `oneBatchAtATime` 은 한 바퀴에
 * 몇 번 움직이는지를 쥔다. 이쪽은 **점 하나가 가리키는 방향이 진짜 내리막에서 이쪽저쪽으로 비끼는 장면** 하나다.
 * definition 은 single example · points off · one side then the other · briefly raise 를 쥐고, batch size · per epoch ·
 * waits · once 를 쓰지 않는다.
 *
 * 전제: 점 다섯 · 처음 (0, 0) · η 0.1 · 뽑는 차례(3 · 0 · 4 · 1 · 2 · 3 · 0 · 1)는 손으로 고정한 값이다. 묶음 크기는 1.
 * 두 축을 같은 축척으로 그려 화면의 각이 셈한 각과 같다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const noisyPathConcept: FacetConceptSource = {
  id: 'noisyPath',
  label: 'Noisy Path of Single-Example Updates',
  canonicalFacet: 'facet:noisyPath',

  surface: {
    definition:
      'A single example\'s gradient points off the direction of steepest descent for the whole dataset, to one side and then the other, so the path zigzags and can briefly raise the total loss.',
    exemplarKeywords: [
      'stochastic gradient',
      'noisy gradient estimate',
      'zigzag path',
      'SGD is noisy',
      'one sample at a time',
      'online gradient descent',
      'gradient of one example vs full gradient',
      'loss goes up during SGD',
      'unbiased but noisy estimate',
      'batch size 1',
    ],
  },

  briefing: {
    observable: [
      'On the left is the (w, b) plane with rings of equal full loss and a cross at the bottom. On the right, "Points and ŷ = w·x + b" shows five points and the current line, with the picked point highlighted and its "Off by" bar. A bottom row stacks each update\'s angle and full loss after it.',
      'Each update draws two arrows from the current place: "Full downhill" (grey dashed) and the picked point\'s downhill (orange, "Point 3"). The arc between them is the angle, counterclockwise positive, and the place moves along the orange arrow. The caption reads "Update #1 · looked at point 3 only · angle off the full downhill: 33°".',
      'The angles run 33° · −30° · −49° · 35° · 44° · 5° · −135° · −16°, changing sign three times.',
      'On update 7, point 0 points almost backward (−135°) and the full loss rises from 0.14 to 0.18, marked with an up arrow in the row: "Full loss went up".',
      'After eight updates the caption reads "Full loss since the start: 4.41 → 0.13" — below a thirtieth of where it began, despite the detours.',
      'The five points, the start (0, 0), η 0.1 and the order of picked points are fixed by hand; batch size is 1. Both axes of the plane share a scale, so the drawn angles equal the computed ones.',
    ],

    screen: {
      affordances: [
        'The screen plays nine steps by itself — the start and eight updates — and stops.',
        'A Replay button and a playback strip sit below. Dragging to update 7 holds the moment the picked direction turns nearly opposite to the full downhill and the loss goes up.',
        'The order of points is fixed, so an article can quote each angle and each loss exactly.',
      ],
    },

    useWhen: [
      'The reader pictures stochastic gradient descent as a smaller, cheaper copy of the exact descent and needs to see individual steps swing to both sides of it.',
      'The article has to reconcile "SGD sometimes makes the loss worse" with "SGD still trains", and wants one run where a step raises the loss and the run still ends thirty times lower.',
    ],

    avoidWhen: [
      'The article compares batch sizes or averages noise over many updates. Only single points are used, in one fixed order.',
      'The subject is the noise helping to escape local minima. The loss here is a single bowl.',
      'The point is how often the weights move per pass of data. This run is about direction, not count.',
    ],

    contrastWith: [
      {
        concept: 'sgd',
        note: 'One point\'s gradient straying from the full direction is the elementary fact; batch size decides how much of that straying is averaged away and how many updates it buys.',
      },
      {
        concept: 'oneBatchAtATime',
        note: 'Updating from part of the data buys more frequent moves; a direction that strays from the full-data downhill is the cost paid for each of them.',
      },
      {
        concept: 'learningRateTooBig',
        note: 'Both can make the loss go up. A single-example step can point the wrong way because it sees one point; with an oversized rate every step points the right way and goes too far.',
      },
    ],
  },
};

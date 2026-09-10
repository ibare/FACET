/**
 * kernelLifts 개념 선언.
 *
 * canonical facet 은 `facet:kernelLifts` — 한 줄 위의 점 일곱(가운데 셋이 A,
 * 바깥 넷이 B)에서 자를 수 있는 자리 여섯을 **전부 해 보고** 나서, 각 점을 제
 * 값의 제곱만큼 들어올려 가로선 하나로 갈리는 것을 보이는 조각이다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 나머지 셋(`svm` · `widestMargin` · `supportVectorsOnly`)은 전부 **평면 위의
 * 두 무리와 선의 자리** 를 말한다. 이 조각만 자리가 아니라 **공간 자체** 를
 * 말한다 — 좌표를 하나 더해 없던 방향을 여는 것. 그래서 definition 에 마진 ·
 * 두께 · 서포트 벡터라는 낱말이 하나도 없고, exemplarKeywords 도 커널과 특징
 * 사상 쪽으로만 간다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const kernelLiftsConcept: FacetConceptSource = {
  id: 'kernelLifts',
  label: 'Kernel Trick (Lifting Into One More Dimension)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:kernelLifts',

  surface: {
    definition:
      'Data that no straight cut can separate in its own space becomes separable once each point gains a coordinate computed from itself, so a single flat boundary suffices there.',
    exemplarKeywords: [
      'kernel trick',
      'feature map',
      'mapping to a higher dimension',
      'not linearly separable',
      'polynomial features',
      'RBF kernel',
      'x squared as a new feature',
      'a curved boundary becomes a straight one',
      'adding a dimension',
      'why kernels work',
    ],
  },

  briefing: {
    observable: [
      'Seven points sit on a single line with the two labels interleaved — one label in the middle, the other at both ends — so the difficulty is visible before anything is attempted.',
      'The screen tries to cut first and lifts afterwards: a knife slides to each of the six positions between neighbouring points in turn, and a bracket under each side names the labels left there, with the caption counting the attempts as they are used up.',
      'Six attempts exhaust every cut that can differ, because any two positions between the same pair of points divide the points identically — the failure is therefore complete, not a sample of failures.',
      'Only after that does the row sink toward the floor of the canvas, opening the space above it; the upward direction is not present until the moment it is needed.',
      'Points rise in order of height rather than left to right, lowest first, so the one at the centre barely lifts and the ones at the ends climb far — the difference in height is what does the separating.',
      'Where the risen points come to rest is traced, and it is not flat.',
      'A single straight horizontal line then descends and halts between the two labels, and the caption counts how many ended below it and how many above.',
      'The horizontal and vertical scales differ, so the traced shape appears flatter than it is.',
    ],

    screen: {
      affordances: [
        'The screen plays the six failed cuts, the lift and the final line on its own, then stops.',
        'Two buttons: Replay, and a step control for taking the moments one at a time, which is how a reader can stop on a single failed cut and read what stayed on each side.',
        'The points and the way they are lifted are fixed — nothing here is chosen by the reader, and the same seven positions run every time.',
      ],
    },

    useWhen: [
      'The article has just said some data "cannot be separated by a line" and the reader has only the author\'s word for it. Exhausting every cut there is, on screen, converts the claim from an impression into a finished argument, and the lift is only worth watching after that.',
      'A reader has met the phrase "map into a higher-dimensional space" and cannot picture what is gained. The middle point barely rising while the outer ones climb far is the whole gain, in one movement.',
      'The prose describes a curved boundary and a straight one as two different methods; seeing one straight cut upstairs correspond to two cut points downstairs is what joins them.',
    ],

    avoidWhen: [
      'The subject is how to choose a kernel, or what goes wrong with too many dimensions — overfitting, the curse of dimensionality, tuning gamma. The lifting rule here is given, and it happens to suit this data.',
      'The article is about computing inner products without forming the mapped coordinates — the part that earns the trick its name. The points here are actually lifted and their new positions are drawn.',
      'The point is margin width, which points fix the boundary, or how much error a classifier will tolerate. The only question asked here is whether a straight cut exists.',
      'The subject is an operating-system kernel, or a kernel in linear algebra (the null space of a map). The word is shared and the meaning is not.',
      'The article is about dimensionality reduction — projecting data down to fewer coordinates. The movement here is in the opposite direction.',
    ],

    contrastWith: [
      {
        concept: 'svm',
        note: 'Two answers to data that resists a straight cut: change the space until the cut works, or keep the cut and pay a price for the points it gets wrong.',
      },
      {
        concept: 'widestMargin',
        note: 'One is choosing between cuts that all succeed; this one begins by establishing that no cut succeeds at all.',
      },
      {
        concept: 'projectAndLose',
        note: 'Opposite directions through dimension: dropping a coordinate can fuse groups that were apart, and adding one can part groups that were fused.',
      },
      {
        concept: 'decisionBoundary',
        note: 'A boundary that looks curved in the original coordinates and straight in the lifted ones is the same boundary, which is what the lifting is for.',
      },
    ],
  },
};

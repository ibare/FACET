/**
 * noiseLeftOut 개념 선언.
 *
 * canonical facet 은 `facet:noiseLeftOut` — 조각(piece)이다. 같은 점 열여섯에
 * 두 방법을 잇달아 건다 — 먼저 밀도로 묶어 남는 것을 남기고, 다음에 중심 둘을
 * 두고 가까운 쪽에 붙여 아무것도 안 남긴다. 오른쪽에는 무리가 뻗어야 했던
 * 거리를 eps 와 견주는 자가 있다. 계기도 코드 패널도 없고 컨트롤은 다시 보기 ·
 * 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `dbscan` 은 손잡이 둘이 서로 다른 것을 만진다는 결과를 맡고, 조각
 * `denseNeighborhood` 는 번짐이 무리를 정한다는 것과 그래서 모양이 자유롭다는
 * 것을 맡는다. 이 조각이 홀로 맡는 것은 **「어느 무리도 아니다」가 답이라는
 * 것** 이다 — 그 답을 낼 수 있는 방법과 못 내는 방법을 나란히 놓아야만 서는
 * 주장이라, 화면에 방법이 둘 있다.
 * definition 의 주어가 "붙이지 않는 결론" 이고, keywords 는 이상점 · 미배정
 * 어휘만 갖는다 (완제품의 매개변수 어휘, denseNeighborhood 의 연결성 어휘와
 * 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const noiseLeftOutConcept: FacetConceptSource = {
  id: 'noiseLeftOut',
  label: 'Noise Points (Belonging to Nothing as an Answer)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:noiseLeftOut',

  surface: {
    definition:
      'Leaving a point unassigned as a result in its own right, set against a method that only compares distances and therefore attaches every point however far away it turns out to be.',
    exemplarKeywords: [
      'noise points',
      'outliers',
      'unassigned points',
      'the label minus one',
      'every point has to belong somewhere',
      'a cluster stretching to swallow a far point',
      'removing outliers before clustering',
      'no cluster is also an answer',
      'partitioning versus leaving out',
      'border point',
      'anomalies in a scatter plot',
    ],
  },

  briefing: {
    observable: [
      'Sixteen points are run twice over: first grouped by density, then attached to the nearer of two centres, with the same points in the same positions both times.',
      'Each point carries its neighbour count inside the radius, and the ones that clear the threshold are marked as cores before any spreading starts.',
      'The spreading halts and the points nothing reached are listed on their own, each with its position and its neighbour count, which is where the first method finishes.',
      'The second run then claims those same points one at a time in order of distance, farthest last, each caption naming the distance and how many times the radius that is.',
      'A ruler sets the radius against the reach each group needed, so the last claim stands as a bar more than three times the length of the radius segment beside it.',
      'The closing state puts the two numbers next to each other — how many the first method left out, and that the second left out none.',
      'A point that spread nothing itself but was reached by a core is drawn as belonging at the edge of its group, so being in a group and being able to extend it are visibly separate things.',
    ],

    screen: {
      affordances: [
        'The screen plays both runs on its own and stops with the two outcomes standing together.',
        'Two buttons: Replay, and a step control that rewinds and walks the same steps one at a time, which is how a reader can stop on a single far claim and read its distance.',
        'The points, the radius, the threshold and the two starting centres are fixed, so an article can name the left-out points and the distance the last claim was made from.',
      ],
    },

    useWhen: [
      'The article says a method assigns every point to a cluster and the reader hears thoroughness. A point being claimed from more than three radii away, with the distance printed as it happens, is what that thoroughness actually costs.',
      'The prose is about outliers and needs "this point belongs to nothing" treated as a verdict rather than a gap in the result — the left-out list names them and the run ends there.',
      'A reader is comparing two groupings by how many groups came out. Here the same sixteen points give two results whose real difference is what one of them declines to answer.',
      'The article has to distinguish a point that merely belongs from one that can extend a group; the edge points join without ever passing membership on.',
    ],

    avoidWhen: [
      'The subject is outlier detection as a task of its own — a score per point, a threshold tuned for it, a detector trained on data. Leaving out here is a by-product of grouping.',
      'The article is about choosing the radius or the threshold. Both are fixed on this screen, and the number left out follows from them without being explored.',
      'The point is how a group spreads from neighbour to neighbour, or what shapes that allows. The spreading runs here only far enough to leave something over.',
      'The article uses noise for signal noise, jitter, measurement error, or randomness deliberately added to data.',
      'The subject is soft membership, where a point receives a degree or a probability of belonging rather than a label or none at all.',
    ],

    contrastWith: [
      {
        concept: 'dbscan',
        note: 'There the count of left-out points is one of two numbers a pair of settings produces; here it is the whole subject, held against a method that can never produce it.',
      },
      {
        concept: 'denseNeighborhood',
        note: 'Both run the same spreading, but that screen follows where it reaches and this one waits for it to stop and looks at what is left.',
      },
      {
        concept: 'kmeans',
        note: 'Every point there attaches to some centre by construction, which is exactly the property put on trial here.',
      },
      {
        concept: 'assignThenMove',
        note: 'Nearest-centre attachment is shown there as a mechanism that works; here the same attachment is run to its edge, where the nearest centre is still far away.',
      },
    ],
  },
};

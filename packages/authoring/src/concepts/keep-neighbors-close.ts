/**
 * keepNeighborsClose 개념 선언.
 *
 * canonical facet 은 `facet:keepNeighborsClose` — 정십각형 꼭짓점 열을 한 줄로
 * 펴는 조각이다. 이웃 열 쌍의 거리가 모두 같은 데서 출발해 한 곳을 끊고, 아홉
 * 쌍은 그대로 옮겨지고 끊긴 한 쌍만 아홉 배로 벌어진다. 마주 보던 쌍의 거리도
 * 달라진다는 것을 끝에 곁들인다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `tsne` 는 실제로 돌려 보는 절차와 손잡이의 영향을 맡고, 형제 조각
 * `globalAndLocal` 은 두 가지로 편 그림을 견주어 무리 사이 거리가 사라지는 것을
 * 맡는다. 이 조각이 맡는 것은 그 앞의 **대가** 하나다 — 짧은 거리를 다 지키기로
 * 하면 어딘가는 반드시 끊긴다는 것. 그래서 definition 에 무리도 무리 사이 거리도
 * 넣지 않았고, keywords 도 찢김 · 왜곡 · 펴기로 몰아 t-SNE 어휘와 견줌 어휘를
 * 형제 둘에 남겼다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const keepNeighborsCloseConcept: FacetConceptSource = {
  id: 'keepNeighborsClose',
  label: 'Keeping Neighbours Close (What the Flattening Tears)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:keepNeighborsClose',

  surface: {
    definition:
      'The trade a neighbourhood-preserving flattening makes: holding every short distance intact forces at least one pair apart, because a closed shape cannot be opened without a break.',
    exemplarKeywords: [
      'preserves local structure',
      'neighbourhood preservation',
      'unrolling a closed shape',
      'distortion introduced by flattening',
      'tearing',
      'you cannot keep every distance',
      'what a projection gives up',
      'short distances versus long distances',
      'manifold flattened onto a line',
      'faithful to neighbours only',
    ],
  },

  briefing: {
    observable: [
      'Ten points sit evenly on a ring, and the opening caption gives the one distance shared by all ten neighbouring pairs, so the starting symmetry is a number rather than an impression.',
      'One link is cut before anything moves, and the caption gives the reason on the spot — the ring is closed and a line is open.',
      'The ring straightens into a line with the neighbour gaps carried over unchanged, so nine of the ten pairs end up at exactly the distance they had.',
      'The cut pair pays for all of it: its two points land at opposite ends of the line and the screen prints the before and after distances with the factor between them.',
      'A closing step measures a pair that was already far apart on the ring and shows that its distance changed too, so the reader cannot conclude that everything except the cut survived.',
      'The ring and the line are drawn against the same scale, so the lengths can be compared by eye and not only through the printed numbers.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole unrolling by itself and stops on the closing line.',
        'Two buttons: Replay, and a step control for taking the same sequence one move at a time, which is how a reader can hold the moment the cut is made before the straightening starts.',
        'The ten points and the cut location are fixed, so an article can name the pair that tears and the reader will find it at the ends of the line.',
      ],
    },

    useWhen: [
      'A method has been described as preserving local structure and the reader hears that as a promise of fidelity. Showing that the promise is kept for nine pairs by breaking the tenth turns it into a stated trade.',
      'The article needs the reader to accept that distortion is structural rather than a defect of an implementation or a bad setting. A ring and a line cannot be reconciled, whatever the method.',
      'The prose is about to say which parts of a flattened picture may be trusted, and the reader needs a case where exactly which pairs survived is countable.',
      'The reader assumes only the broken pair is affected. The far pair measured at the end shows the damage is not confined to the cut.',
    ],

    avoidWhen: [
      'The article is about nearest-neighbour search or nearest-neighbour classification. The word "neighbour" here means adjacency on a shape, and nothing is being searched or predicted.',
      'The subject is comparing two flattening methods, or reading distances between groups in an embedding. There is one shape here and no groups at all.',
      'The point is how a specific method computes its embedding — its objective, its gradient, its settings. This is done by hand and no method is run.',
      'The article is about graph cuts, partitioning, or removing edges to separate components. The single cut here exists to open a shape, not to divide it.',
    ],

    contrastWith: [
      {
        concept: 'globalAndLocal',
        note: 'Both are about what a flattening gives up; this counts the pairs that survive one unrolling, that one compares two flattenings of the same points and finds the group gaps evened out.',
      },
      {
        concept: 'tsne',
        note: 'The cost shown here by hand is what an actual run pays automatically, where the setting decides which relations get broken.',
      },
      {
        concept: 'projectAndLose',
        note: 'Two ways of losing information when dimensions drop — one flattens along a direction and merges what lay behind, this one keeps every short distance and pays for it in a single tear.',
      },
      {
        concept: 'knn',
        note: 'One relies on neighbours being the right thing to trust, the other shows the price of a picture that was built to keep exactly that and nothing else.',
      },
    ],
  },
};

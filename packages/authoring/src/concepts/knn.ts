/**
 * knn 개념 선언.
 *
 * canonical facet 은 `facet:knn` — 완결형이다. 왼쪽 평면에 24 × 24 격자 576 칸을
 * 지금 k 로 판정해 칠하므로 경계가 그림에 직접 나오고, 오른쪽에는 불려 나온
 * 이웃이 쌓이는 투표판이 선다. k 슬라이더(1·3·7·15), 누적 계기 셋(잰 거리 ·
 * 삼켜진 점 · A 칸), 여섯 언어로 펼쳐지는 코드 패널이 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **방법 전체와 그 대가** 를 맡는다 — 훈련이 없어 물음마다 자료를
 * 통째로 다시 훑는다는 것, 그래서 k 를 옮기면 한 점의 답이 아니라 평면 전체가
 * 다시 칠해진다는 것, k = 1 은 자료를 외운 것이라 틀린 점이 0 이 된다는 것.
 * 무게중심은 한 번의 판정이 아니라 **판정 규칙이 평면과 비용에 남기는 결과** 다.
 * 조각 `voteByNeighbors` 는 표를 던지는 자격이 거리로 갈린다는 것만, 조각
 * `kChangesBoundary` 는 k 를 키우면 같은 점의 답이 뒤집힌다는 것만 말한다.
 * keywords 도 이쪽은 훈련 없음 · 예측 비용 · 결정 경계 · 응용 어휘를, 조각들은
 * 각각 다수결 어휘와 k 고르기 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const knnConcept: FacetConceptSource = {
  id: 'knn',
  label: 'k-Nearest Neighbours (Nothing Is Learned Before the Question)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:knn',

  surface: {
    definition:
      'A classification method with no training step: every labelled example is kept, each query measures its distance to all of them, and k decides how the plane gets divided.',
    exemplarKeywords: [
      'k-nearest neighbours',
      'KNN',
      'lazy learning',
      'instance-based learning',
      'no model is fitted',
      'the whole training set is the model',
      'decision boundary',
      'k = 1 memorises the data',
      'overfitting and smoothing',
      'prediction cost grows with the dataset',
      'recommend items liked by similar users',
      'classify by similarity',
    ],
  },

  briefing: {
    observable: [
      'The plane is painted cell by cell with the verdict at each spot, so the boundary is drawn rather than described — it appears as the seam between two colours over 576 cells.',
      'The eighteen labelled examples are drawn as circles for one tag and squares for the other, so the two groups stay apart without relying on colour.',
      'Moving the k slider repaints the entire plane at once; cells whose verdict changed are outlined, so the extent of the change is visible instead of only the new picture.',
      'Going from the smallest to the largest k outlines seventy-eight of the 576 cells — roughly one in eight spots gets a different answer for the same data.',
      'The distance counter jumps by more than ten thousand each time k moves, because every cell of the grid is measured against all eighteen examples again.',
      'Two of the eighteen examples sit inside the other group; at k = 1 the "overruled" counter reads zero and both keep their own tag, and raising k puts red rings on them and the counter leaves zero.',
      'On the right, neighbours accumulate one chip at a time in the order they were picked, while on the left a circle grows from the query out to the neighbour just taken.',
      'The run visits six query positions in turn; four of them change their answer somewhere along the slider and two never do.',
      'Distances are kept squared and a caption states that taking a square root would not change which example is nearest, so it is never taken.',
      'The code panel highlights the line matching the current step as the run plays.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. A tour of six query positions plays on mount and then the screen waits.',
        'A segmented slider beside the playback controls sets how many neighbours are consulted — 1, 3, 7 or 15 — starting at 3, and it keeps the current position rather than restarting the tour.',
        'The way to see the cost of the method is to note the distance counter, move the slider one notch, and read it again.',
        'The code panel starts empty. The reader clicks Add language and picks from Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article says the method has no training phase and a reader treats that as a convenience. Watching the distance counter climb into five figures on a single slider move is what turns the missing training cost into a prediction cost.',
      'The prose claims a model that classifies every training example correctly is not thereby a good model. At k = 1 the overruled counter reads zero on this data, and raising k makes it leave zero — the same argument without any held-out set.',
      'A reader thinks of a classifier as a line drawn once. Repainting all 576 cells on a slider move, with the changed ones outlined, replaces the line with something the data and one number produce together.',
    ],

    avoidWhen: [
      'The letter k stands for a number of clusters rather than a number of neighbours. Every example here already carries a tag and nothing is being grouped.',
      'The subject is how nearest neighbours are found quickly — k-d trees, ball trees, locality-sensitive hashing, or an approximate vector search index. Every distance here is measured by brute force on purpose.',
      'The article is about neighbours in a graph, a network topology, or adjacency between nodes.',
      'The point is predicting a number rather than a tag, or how distance should be weighted so nearer examples count more. Each consulted example here carries exactly one vote.',
      'The article needs high-dimensional data or the failure of distance in many dimensions. This screen is two-dimensional throughout.',
    ],

    contrastWith: [
      {
        concept: 'voteByNeighbors',
        note: 'That is one query answered slowly enough to see who is allowed to speak; this asks the same question at every spot on the plane and reports what the answers add up to.',
      },
      {
        concept: 'kChangesBoundary',
        note: 'Both vary k, but that one holds a single query point and watches its answer flip, while this one holds the whole plane and watches the boundary move.',
      },
      {
        concept: 'kmeans',
        note: 'The k counts something different in each: there it is how many groups to form from unlabelled points, here it is how many labelled examples to consult about one point.',
      },
      {
        concept: 'decisionBoundary',
        note: 'Both make the divide between classes the object; a boundary from a fitted rule is a shape decided in advance, while this one is whatever the stored examples and k produce at each spot.',
      },
    ],
  },
};

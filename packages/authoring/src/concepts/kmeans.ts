/**
 * kmeans 개념 선언.
 *
 * canonical facet 은 `facet:kmeans` — 완결형이다. 왼쪽에 점 열둘과 중심이 놀고
 * 오른쪽에 **멎은 답의 장부** 가 쌓인다. k 슬라이더(2·3·4·5)와 시작 다시 뽑기
 * 단추, 누적 계기 셋(바퀴 · 지금 흩어짐 · 잰 거리 횟수), 그리고 여섯 언어로
 * 펼쳐지는 코드 패널이 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **절차 전체와 그 결과** 를 맡는다 — 같은 k 인데 시작만 바꾸면 다른
 * 자리에서 멎고, 그렇게 멎은 답들 가운데 가장 흩어짐이 작은 것이 사람이 보는
 * 무리가 아니라는 것. 즉 수렴 자체가 아니라 **수렴한 곳이 여럿이라는 사실** 이
 * 무게중심이다.
 * 조각 `assignThenMove` 는 한 바퀴의 두 몸짓과 멎음의 조건만, 조각
 * `kMustBeGiven` 은 k 가 입력이라는 것만 말한다. keywords 도 이쪽은 초기화 ·
 * 지역 최적 · 응용 어휘를, 조각들은 각각 반복 한 걸음 · 군집 수 고르기 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const kmeansConcept: FacetConceptSource = {
  id: 'kmeans',
  label: 'k-Means (Where the Answer Settles Depends on Where It Started)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:kmeans',

  surface: {
    definition:
      'A clustering method that alternates nearest-centre assignment with re-centring until nothing moves, settling into one of several stable answers determined by the starting centres.',
    exemplarKeywords: [
      'k-means',
      "Lloyd's algorithm",
      'centroid',
      'local optimum',
      'k-means++',
      'random initialisation',
      'different results on every run',
      'within-cluster sum of squares',
      'inertia',
      'unsupervised learning',
      'customer segmentation',
      'colour quantisation',
      'vector quantisation',
    ],
  },

  briefing: {
    observable: [
      'The plot keeps the same scale on both axes and pads the shorter one instead of stretching, so the centre a point looks nearest to is the centre it actually attaches to.',
      'Each round shows the same two gestures in order — every point measures every centre and keeps only the nearest, then every centre steps to the mean of what attached to it — and the caption after the move reports how far the centres travelled in total.',
      'The run ends on a round where the total travel is zero, and the caption says there is nowhere left to go rather than announcing a correct answer.',
      'A ledger on the right keeps one row per settled answer — k and which start, the group sizes, the scatter — and rows from earlier starts are never cleared, so several answers at the same k sit side by side.',
      'Two ledger rows can be flagged at once: the tightest scatter found so far, and the split a person looking at the picture would call the right one; on this data they are different rows and the caption states how many times more scattered the second is.',
      'Changing k or drawing a new start abandons the run in progress and begins a new one from the first round, but the ledger survives the change.',
      'Distances stay squared throughout, and a caption says outright that taking a square root would not change which centre is nearest, so it is never taken.',
      'Three counters run along the bottom: rounds turned, the current scatter rounded to an integer, and how many distances have been measured.',
      'The code panel highlights the line matching the current step as the rounds play.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider. A first run plays to a stop on mount and then the screen waits.',
        'Two knobs sit beside the playback controls — a segmented slider for k over 2, 3, 4 and 5, and a "New start" button that draws the next set of starting centres at the current k.',
        'The way to make several answers appear at one k is to leave the slider alone and press "New start" a few times, reading the ledger after each run rather than the plot.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article says the method "finds" the clusters and a reader takes that as a single right answer waiting to be uncovered. Several rows in the ledger at one k, none of which can move, is what turns that into a choice among stable stopping points.',
      'The prose treats a lower objective as a better clustering. Here the tightest row and the row a person would pick are two different rows, and the caption names the ratio between them.',
      'A reader is about to conclude that a bad result means a bug or too few iterations. Watching a run end with zero total travel, and a different start end somewhere else, locates the cause in the initialisation instead.',
    ],

    avoidWhen: [
      'The article is about clustering where the number of groups is discovered from the data — density-based methods, or cutting a tree of merges. Something has to be chosen here before a run can start.',
      'The subject is classification with labelled data, or picking a label by majority vote among nearby examples. Nothing on this screen has a known answer to learn from.',
      'The point is k-means++ or another initialisation scheme as a procedure. The starting centres here are drawn from a fixed set of alternatives to show that the choice matters, not to demonstrate how a good one is computed.',
      'The article needs clusters of unequal density or elongated shape handled properly, or a per-point notion of noise. Every point here is attached to some centre.',
      'The word "means" refers to averages in statistics generally, or "k" to a neighbour count.',
    ],

    contrastWith: [
      {
        concept: 'assignThenMove',
        note: 'That is one turn of the alternation shown closely enough to see why it must stop; this is many complete runs, kept side by side to show that stopping does not mean agreeing.',
      },
      {
        concept: 'kMustBeGiven',
        note: 'Both vary k, but that one asks whether any measure can choose k while this one holds k fixed and varies the start instead.',
      },
      {
        concept: 'dbscan',
        note: 'Both group unlabelled points, but density-based grouping is told how close and how many rather than how many groups, and it is allowed to leave points out.',
      },
      {
        concept: 'hierarchical',
        note: 'Merging pairs builds every number of groups at once and the reader cuts afterwards; here the number is fixed before the first round and the whole run depends on it.',
      },
    ],
  },
};

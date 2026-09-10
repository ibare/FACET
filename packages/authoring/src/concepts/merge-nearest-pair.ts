/**
 * mergeNearestPair 개념 선언.
 *
 * canonical facet 은 `facet:mergeNearestPair` — 화면이 둘로 나뉜다. 왼쪽은 점
 * 여덟이 실제로 놓인 자리이고 걸음마다 남은 무리쌍의 거리를 재는 실이 뻗는다.
 * 오른쪽이 주인공으로, 합친 자리가 그 거리만큼 **올라가 걸리는** 나무다.
 * 왼쪽 아래 띠는 남은 무리 수를 칸으로 보이는데, 글자는 자리를 지키고 칸만
 * 자라 서로를 삼킨다. 맺음에서 걸린 높이 일곱이 매듭에서 떨어져 나와 왼쪽
 * 자에 한 줄로 옮겨 붙는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 조각이 지는 것은 **무리 수를 묻지 않고 짓는다** 하나다 — 저마다 한 무리로
 * 시작해 가장 가까운 둘을 합치고, 합친 자리를 그 거리만큼의 높이에 건다.
 * 그래서 높이가 곧 "얼마나 먼 것들을 합쳤는가" 이고, 낮게 몰린 넷과 훌쩍 뛴
 * 셋 사이의 빈 자리가 이 조각의 산출물이다. 여덟에서 하나까지가 한 그림에 다
 * 들어온다.
 *
 * 거리를 재는 법의 선택은 `hierarchical` 의 몫이라 여기서는 단일 연결 하나만
 * 쓰고 그것을 손잡이로 두지 않는다. 다 자란 나무에서 무리 수를 정하는 일은
 * `dendrogramCut` 이 진다 — 여기에는 자르는 선이 없다.
 *
 * 변별어를 붙인 이유: "merge" 만으로는 정렬의 병합과 갈리지 않고, "nearest"
 * 만으로는 이웃 분류와 갈리지 않는다. 가장 가까운 **쌍** 을 합쳐 올라간다는
 * 것이 이 조각의 전부다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mergeNearestPairConcept: FacetConceptSource = {
  id: 'mergeNearestPair',
  label: 'Clustering Without Fixing the Number First',
  domain: 'ml-basics',
  canonicalFacet: 'facet:mergeNearestPair',

  surface: {
    definition:
      'Grouping built from the bottom up: everything starts alone, the two closest groups join, and each join is recorded at a height equal to the distance that produced it.',
    exemplarKeywords: [
      'agglomerative',
      'bottom-up merging',
      'clustering when you do not know how many groups',
      'the nearest pair joins first',
      'join height equals distance',
      'exploratory data analysis on a new dataset',
      'an outlier joins last',
      'proximity between groups',
      'a gap between the low joins and the high ones',
      'nested groups of groups',
    ],
  },

  briefing: {
    observable: [
      'Eight points start as eight separate groups, so the first step joins two individual points rather than anything already grouped.',
      'Every step draws threads to every remaining pair before one of them thickens and survives, which shows that all remaining pairs were measured and not just the winner.',
      'On the right a rung is hung across the two groups that joined, and its height on the vertical ruler is the distance that was measured, not a step count.',
      'The first four rungs land below one and the last three jump to roughly two point nine, three point seven and three point seven — the vertical gap between the two families is wide and empty.',
      'One point sits alone away from the others and is not joined until the sixth of seven steps, so lateness on the vertical scale is visibly a property of being far away.',
      'The last two rungs land at almost the same height and nearly overlap on screen.',
      'A band in the lower left shows how many groups remain as cells that grow and swallow one another while their labels stay in place, so what merges reads as groups rather than points.',
      'At the close, the seven heights detach from their rungs and slide onto the vertical ruler as a single column, collapsing the tree into the list of distances that built it.',
    ],

    screen: {
      affordances: [
        'The screen plays all seven joins on its own and stops with the heights gathered on the ruler.',
        'Two buttons: Replay, and a step control for taking one join at a time, which is how a reader can stop on the threads before the shortest one is picked.',
        'The eight points are fixed, so an article can name a pair and the height at which it joins.',
      ],
    },

    useWhen: [
      'The article admits it does not know how many groups the data has, and the reader expects that to be a blocking question. Watching the run go from eight groups to one without the number ever being supplied is what removes the block.',
      'The prose treats a tree diagram as decoration. Hanging each rung at the distance that was actually measured makes the vertical axis readable as a quantity rather than as a drawing convention.',
      'A point that belongs to nothing needs to be recognisable rather than defined: the isolated point here is joined near the end at a large height, and that lateness is the whole signature.',
      'The reader needs to see where the interesting structure is before any threshold is discussed — four low joins and three high ones, with nothing in between, is the shape that a later decision will lean on.',
    ],

    avoidWhen: [
      'The article is about merging two already-sorted sequences into one.',
      'The subject is classifying a new point by the labels of its nearest neighbours; nothing here has labels and no query point is introduced.',
      'The point is which definition of distance between two groups to adopt. One rule is used throughout here and is never varied.',
      'The article needs the number of groups decided, or a threshold chosen. The run ends with everything in one group and never cuts.',
      'The subject is divisive clustering that starts from one group and splits, or a method that requires the number of groups before it begins.',
      'The article is about scaling to large datasets, where measuring every remaining pair at every step is exactly what has to be avoided.',
    ],

    contrastWith: [
      {
        concept: 'hierarchical',
        note: 'This uses one rule for the distance between two groups and never questions it; that makes the rule the handle and shows three different trees coming out of the same points.',
      },
      {
        concept: 'dendrogramCut',
        note: 'Two halves of one workflow: this grows the tree and stops at a single group, that starts from a finished tree and slides a line across it.',
      },
      {
        concept: 'kmeans',
        note: 'One asks for the number of groups before it can start, the other reaches every number on the way up and postpones the question entirely.',
      },
      {
        concept: 'kruskalMst',
        note: 'Both repeatedly take the shortest remaining link between two separate parts; one keeps the links as a network and this one keeps only the height at which the parts fused.',
      },
      {
        concept: 'noiseLeftOut',
        note: 'A far-off point is left unassigned there, while here it is eventually pulled in at a large height — the isolation shows up as a number rather than as an exclusion.',
      },
    ],
  },
};

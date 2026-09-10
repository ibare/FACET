/**
 * hierarchical 개념 선언.
 *
 * canonical facet 은 `facet:hierarchical` — 한 폭에 넷을 담은 완결형이다.
 * 왼쪽 위 점판(점 여덟, 다리 노릇을 하는 둘에는 점선 고리), 오른쪽 위 나무,
 * 왼쪽 아래 지금 나무의 병합 차례 일곱, 오른쪽 아래 본 답이 쌓이는 표.
 * 손잡이 둘(연결 방식 · 자르는 높이)과 누적 카운터 셋, 그리고 여섯 언어로
 * 펼쳐지는 코드 패널이 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 완제품이 지는 것은 **두 무리 사이의 거리를 무엇으로 재는가** 하나다.
 * 최솟값 · 최댓값 · 평균 셋이 같은 점에서 서로 다른 나무를 짓고, 그래서 같은
 * 높이에서 자른 답까지 갈린다(높이 2 에서 1 / 3 / 3). 조각 둘은 어느 쪽도
 * 이 선택을 다루지 않는다 — 둘 다 단일 연결 하나만 쓴다.
 *
 * 나무를 짓는 절차 자체는 `mergeNearestPair`, 다 자란 나무를 자르는 일은
 * `dendrogramCut` 의 몫이라 여기서는 그 둘을 손잡이 뒤로 밀어 두고 **둘이
 * 맞물릴 때에만 보이는 것** 만 말한다.
 *
 * 변별어를 붙이지 않았다. facet id 가 이미 `hierarchical` 이고, ml-basics 안에서
 * 계층 군집화를 다투는 형제가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hierarchicalConcept: FacetConceptSource = {
  id: 'hierarchical',
  label: 'Hierarchical Clustering (Choice of Linkage)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:hierarchical',

  surface: {
    definition:
      'Agglomerative clustering in which the linkage rule — the minimum, maximum or mean of the pairwise distances between two groups — decides the tree and therefore the answer a cut returns.',
    exemplarKeywords: [
      'linkage',
      'single linkage',
      'complete linkage',
      'average linkage',
      'chaining effect',
      'which linkage should I use',
      'scipy linkage method',
      'distance between two clusters',
      'noise points bridging two groups',
      'the same data giving different clusters',
      'elongated versus compact clusters',
      'sensitivity of a clustering method',
    ],
  },

  briefing: {
    observable: [
      'Eight points sit in two visible blobs with a pair between them ringed by a dotted outline, and the same pair is what one linkage rule walks across and the others do not.',
      'The three trees are drawn against one shared vertical scale, so their merge heights can be read against each other rather than each tree being normalised to its own frame.',
      'Moving the linkage handle redraws the tree without replaying the run, and the last merge lands at roughly two, six and a half, or four and a half depending on which rule is chosen.',
      'A dashed horizontal line marks the cut height, and the points in the scatter are recoloured by which group they fall into at that line.',
      'A table in the lower right keeps every answer already seen instead of clearing it, so the row for one cut height ends up holding all three linkage answers side by side — one, three and three.',
      'At the two lowest cut heights all three linkages give the same number, and the numbers only diverge further up.',
      'The caption states in words whether the two blobs ended in the same group or stayed apart, and it changes as either handle moves.',
      'Three counters run along the bottom: merges made, clusters at the current cut, and how many pairwise distances have been measured.',
      'The code panel holds one merge step, and moving the linkage handle shifts the highlight between the three lines in its inner loop that differ — keep the smallest, keep the largest, or accumulate a sum.',
    ],

    screen: {
      affordances: [
        'The screen demonstrates the seven merges once on mount and then waits; play, step, pause, reset and a speed slider drive that replay.',
        'Two handles: linkage with three settings, and cut height with six. Both recompute the answer in place rather than restarting the animation.',
        'The argument needs both handles: fix the cut at two and sweep the linkage, and the accumulated table fills one row with three different cluster counts.',
        'A language is chosen in the code panel, after which the highlighted line follows the current step and the linkage handle.',
        'The eight points are fixed, so an article can name the bridging pair and the merge heights each linkage produces.',
      ],
    },

    useWhen: [
      'The article treats clustering as if the data alone determined the groups. Sweeping one handle while the points and the cut both stay put, and reading three different cluster counts out of the accumulated table, puts the choice of method back in view.',
      'The reader is warned about chaining without being shown it. Two stray points between two blobs are visibly enough for one rule to walk across and merge everything, while the other two never make the crossing.',
      'An article has to justify why a method choice matters more than an implementation detail: the entire difference lives in three interchangeable lines of the inner loop, and the highlight moving between them is the whole story.',
      'The reader assumes methods disagree everywhere. At the lowest cut heights all three agree, because between two single points the smallest, largest and mean distance are the same number.',
    ],

    avoidWhen: [
      'The article uses "hierarchy" for nested containment — a file tree, an organisation chart, a class hierarchy, nested categories. Nothing here is about traversing or storing a hierarchy.',
      'The subject is a method that requires the number of groups up front and refines an assignment iteratively.',
      'The point is divisive clustering, which starts from one group and splits downward.',
      'The article is about density-based grouping, where points too far from anything are left unassigned rather than eventually merged.',
      'The subject is supervised learning with labels available, where the right grouping can be checked against ground truth. The disagreement shown here is precisely the case where nothing can adjudicate.',
      'The article needs Ward linkage or a non-Euclidean metric specifically; the three rules here are all built from straight-line distances between points.',
    ],

    contrastWith: [
      {
        concept: 'mergeNearestPair',
        note: 'That builds one tree with one distance rule and stops there; this asks what the rule should have been and shows three trees from the same points.',
      },
      {
        concept: 'dendrogramCut',
        note: 'That fixes the tree and moves the cut; this holds the cut still and changes the tree underneath it, which is the harder of the two dependencies to see.',
      },
      {
        concept: 'kmeans',
        note: 'Both partition unlabelled points, but one needs the number of groups before it starts and this one produces every number at once and defers the choice to a cut.',
      },
      {
        concept: 'dbscan',
        note: 'Both are sensitive to points lying between two groups, and they respond oppositely: density-based grouping can discard them as noise while a minimum-distance linkage uses them as a bridge.',
      },
      {
        concept: 'kMustBeGiven',
        note: 'The count of groups is an input there and an output of a cut here, which moves the same decision from the start of the method to the end.',
      },
    ],
  },
};

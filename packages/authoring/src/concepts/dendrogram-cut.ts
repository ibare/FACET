/**
 * dendrogramCut 개념 선언.
 *
 * canonical facet 은 `facet:dendrogramCut` — 나무가 **이미 다 자란 채로**
 * 나타나고, 가로선 하나가 아래에서 위로 미끄러진다. 선이 지나는 세로 가지의
 * 수가 곧 무리 수이고, 잎 이름표 아래의 띠가 그 무리를 보인다. 끊는 걸음에서는
 * 선 위쪽 — 버려지는 부분 — 이 흐려지고 지나던 가지가 선 자리에서 실제로 끊겨
 * 끝이 캡으로 막힌다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 조각이 지는 것은 **다 지은 뒤에 남은 결정 하나** 다 — 자르는 데에는 셈이
 * 없고, 높이 하나를 고르는 일뿐이며, 고르는 것은 사람이다. 기댈 곳은 가로대
 * 사이가 넓게 빈 구간 하나이고, 그런 구간이 둘이면 답도 둘인데 둘 다 옳다.
 *
 * 나무가 어떻게 자라는가는 `mergeNearestPair` 의 몫이라 여기서는 첫 걸음에
 * 다 자란 채로 나타나고 합치는 장면이 아예 없다. 거리를 재는 법의 선택은
 * `hierarchical` 이 진다 — 여기서는 단일 연결 하나로 고정이다.
 *
 * 변별어를 붙이지 않았다. "dendrogram cut" 은 이 한 가지 조작만 가리킨다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dendrogramCutConcept: FacetConceptSource = {
  id: 'dendrogramCut',
  label: 'Cutting the Dendrogram (Deciding How Many Groups)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:dendrogramCut',

  surface: {
    definition:
      'Turning a finished cluster tree into a grouping by choosing one height: a horizontal line is drawn there and the vertical branches it crosses are the resulting groups.',
    exemplarKeywords: [
      'dendrogram',
      'cut the tree at a height',
      'how many clusters should I take',
      'distance threshold',
      'flat clusters from a linkage tree',
      'the largest gap between successive merges',
      'a stable choice of the number of groups',
      'reading a tree diagram',
      'the same tree gives four groups or two',
      'the method does not tell you the number',
    ],
  },

  briefing: {
    observable: [
      'The tree is complete in the very first frame and never grows — the run opens by saying so, and no pair is ever joined on screen.',
      'A horizontal line slides upward through the tree one resting place at a time, pausing between consecutive crossbars rather than at them.',
      'The cluster count changes only when the line passes a crossbar, and it steps down one at a time from eight to one as the line rises.',
      'The crossbars are unevenly spaced on the height axis: four sit close together low down, then there are two wide empty stretches further up.',
      'Those wide stretches are marked out explicitly once the sweep finishes, and the run then settles inside each of them in turn — four groups in the lower one, two groups in the upper one.',
      'When the line settles, everything above it fades out and the branches it crosses are visibly severed, with the cut ends capped.',
      'A band under the leaf labels shows which leaves currently belong together, so the count on the axis and the membership below stay in step.',
      'The run ends on a statement that the tree does not choose the number and a person does, having shown two defensible answers rather than one.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sweep on its own — up through every resting place, then into each wide stretch — and stops there.',
        'Two buttons: Replay, and a step control that moves the line one resting place at a time, which is how a reader can stop just below and just above a crossbar and compare the counts.',
        'The eight leaves and their merge heights are fixed, so an article can quote a height and the number of groups it yields.',
      ],
    },

    useWhen: [
      'The article says a clustering method does not need the number of groups in advance and the reader takes that to mean the number never has to be chosen. Watching the line slide from eight groups to one shows the choice was deferred, not removed.',
      'A threshold has to be defended rather than announced: the run shows that inside a wide empty stretch the line can wobble without the answer changing, while near a crossbar a small nudge changes it.',
      'The reader wants the data to settle a question that has two reasonable answers. Two wide stretches are marked here and the run cuts in both, which makes the ambiguity concrete instead of arguable.',
      'The prose needs the vertical axis of a tree diagram to be read as a distance rather than as a drawing convention, since it is exactly what the threshold is compared against.',
    ],

    avoidWhen: [
      'The subject is how the tree was built — which pairs joined, in what order, at what cost.',
      'The article is about which definition of distance between two groups to use, which changes the tree itself rather than where it is cut.',
      'The point is choosing the number of groups for a method that demands it up front, by sweeping that number and reading an error curve. Nothing is refitted here; one finished tree is read at different heights.',
      'The subject is cutting a graph into parts by removing edges — minimum cut, graph partitioning, community detection.',
      'The article is about pruning a decision tree, where branches are removed to control overfitting rather than to read off a grouping.',
      'The subject is inferring an evolutionary tree from sequences, where building the tree is the whole problem.',
    ],

    contrastWith: [
      {
        concept: 'mergeNearestPair',
        note: 'That earns the tree join by join and stops at a single group; this starts where that ends and spends the whole run on the one decision left over.',
      },
      {
        concept: 'hierarchical',
        note: 'The cut height is the handle here and the tree is fixed; there the tree changes underneath a fixed cut, so the same height can return different answers.',
      },
      {
        concept: 'kMustBeGiven',
        note: 'Both are about where the number of groups comes from — one has to supply it before anything runs, this one reads it off afterwards from a line.',
      },
      {
        concept: 'kChangesBoundary',
        note: 'Changing the number of groups redraws the partition in both, but there each value is a separate fit and here every value is already present in one tree.',
      },
    ],
  },
};

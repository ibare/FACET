/**
 * globalAndLocal 개념 선언.
 *
 * canonical facet 은 `facet:globalAndLocal` — 무리 셋(각 넷)을 두 가지로 펴서
 * 자 두 줄에 나란히 놓는 조각이다. 위 자는 가장 넓게 퍼진 방향에 내려 찍어 큰
 * 거리를 지키고, 아래 자는 무리 안의 차례만 지키고 무리끼리는 같은 간격으로
 * 늘어놓는다. 양 끝 무리를 두 자에서 같은 자리에 못박아 두었으므로 실이 기우는
 * 것은 가운데 무리의 이야기다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `tsne` 는 실제로 돌려 보는 절차와 손잡이의 영향을, 형제 조각
 * `keepNeighborsClose` 는 짧은 거리를 다 지키면 어딘가 찢어진다는 대가를 맡는다.
 * 이 조각이 맡는 것은 **견줌** 이다 — 같은 자료를 두 가지로 편 그림을 나란히
 * 놓고, 세 배였던 사이가 같아지는 것을 몫으로 재어 보인다. definition 을 "두
 * 그림의 차이" 로 잡았고, keywords 는 전역 대 지역 · 무리 사이 거리 오독 ·
 * 주성분 쪽 어휘로 몰았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const globalAndLocalConcept: FacetConceptSource = {
  id: 'globalAndLocal',
  label: 'Global and Local Structure (Two Flattenings Compared)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:globalAndLocal',

  surface: {
    definition:
      'The difference between two flattenings of the same points: one keeps long distances in proportion, the other spaces groups evenly so between-group gaps stop meaning anything.',
    exemplarKeywords: [
      'global versus local structure',
      'cluster distances in an embedding',
      'these two clusters look close',
      'gap ratio between groups',
      'projection onto the direction of widest spread',
      'principal component versus a neighbour-based layout',
      'misreading a scatter plot',
      'evenly spaced clusters',
      'which plot to trust for what',
      'what survives a dimension drop',
    ],
  },

  briefing: {
    observable: [
      'Two rulers run one above the other and carry the same twelve items, so every claim is a comparison between two rows rather than a statement about one picture.',
      'The end groups are pinned to the same spots on both rulers, which means any tilt in the threads joining the rows belongs to the middle group and cannot be an artefact of alignment.',
      'Threads join each item to itself across the two rows, and the middle group\'s threads lean by a printed amount.',
      'Distances are never compared directly between the rows — the two rulers have different units, so every figure on screen is a share of the span between the outermost group centres.',
      'The share one group occupies is read on both rows, and the bottom row gives a group enough room that its four items are individually readable while the top row compresses them.',
      'The gap between neighbouring groups is measured on both rows against the original share, and then the two gaps are put as a ratio: what was roughly three to one in the data comes out near one to one on the bottom row.',
      'Threads inside a group sometimes cross, because the order within a group on the bottom row comes from that group measured on its own.',
      'The closing caption states the reading rule directly — do not take a between-group distance off the bottom ruler.',
    ],

    screen: {
      affordances: [
        'The screen walks the whole comparison on its own — laying out both rows, joining them, then measuring inside a group, between groups, and finally the ratio — and stops on the verdict.',
        'Two buttons: Replay, and a step control for taking the same sequence one measurement at a time, which is how a reader can stop on the gap figures before the ratio is drawn.',
        'The three groups and their coordinates are fixed, so an article can name a specific group and the reader will find it in the same position on both rulers.',
      ],
    },

    useWhen: [
      'An article or a reader has drawn a conclusion from how far apart two groups sit in a plot. Seeing a threefold difference come out even under a neighbour-preserving layout removes the ground under that reading.',
      'The prose has to explain why two pictures of the same data disagree without either being wrong, and needs the disagreement laid out as a measured quantity rather than as two impressions.',
      'The reader needs a rule for which picture answers which question — where to look for the order within a group, and where to look for how far apart the groups are.',
      'The article claims that spreading a group out to make it readable costs something. Here the cost is visible in the same frame as the benefit: the row where the four items separate is the row where the group gaps go flat.',
    ],

    avoidWhen: [
      'The article uses "global" and "local" for variable scope in a program, or for global and local minima in an optimization. Both are unrelated senses.',
      'The subject is how a particular embedding method computes its layout — its objective, its settings, its convergence. Both rows here are laid out by hand.',
      'The point is grouping the data in the first place — deciding membership or how many groups there are. The three groups are given, and nothing here discovers them.',
      'The article needs the mechanics of principal components: eigenvalues, explained variance, loadings. The top row only uses the widest direction and never names its numbers.',
    ],

    contrastWith: [
      {
        concept: 'keepNeighborsClose',
        note: 'Both weigh what a flattening keeps against what it drops; that one counts the pairs surviving a single unrolling, this one sets two whole layouts against each other.',
      },
      {
        concept: 'tsne',
        note: 'The evening-out of group gaps shown here by hand is what an actual run produces on its own, and precisely in the setting that makes the groups look cleanest.',
      },
      {
        concept: 'directionOfMostSpread',
        note: 'That concept is the axis that carries the long distances through; this one is what a layout gives up once it stops laying points out along such an axis.',
      },
      {
        concept: 'pca',
        note: 'One is the method the top row stands in for; this concept exists to say what reading that method supports and a neighbour-based picture does not.',
      },
    ],
  },
};

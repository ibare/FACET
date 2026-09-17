/**
 * crowdTheTails 개념 선언.
 *
 * canonical facet 은 `facet:crowdTheTails` — 조각(piece)이다. 위에 눈금이 고른
 * 간격으로 박힌 k 자, 아래에 분위 0…1 의 q 자와 그릇 여섯, 그 위에 제 분위
 * 자리에 선 점 예순이 있다. 고르게 자른 경계가 척도를 거치며 미끄러져 꼬리에서
 * 좁아지고, 가운데 짝에서 꼬리 짝으로 점이 담기고, 마지막에 뭉치마다 자국
 * 하나가 남는다. 계기는 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `tDigest` 는 **그렇게 나눈 값이 무엇인가** 를 맡는다 — 손잡이로 자리
 * 수를 늘렸을 때 꼬리 오차가 가운데보다 빠르게 준다는 것. 이 조각이 홀로 맡는
 * 것은 그 앞의 물음, **자리를 어떻게 나누는가** 다: 경계를 손으로 놓지 않고
 * 척도를 고르게 끊어 되돌리면 폭이 저절로 꼬리에서 좁아진다는 것. 그래서
 * definition 의 주어가 "경계의 배치" 이고 질의도 오차도 말하지 않으며,
 * keywords 는 구간 나누기 · 불균등 폭 어휘만 갖는다 (완제품의 p99 · 압축 계수
 * 어휘와 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const crowdTheTailsConcept: FacetConceptSource = {
  id: 'crowdTheTails',
  label: 'Crowd the Tails (Bucket Widths That Narrow at the Extremes)',
  canonicalFacet: 'facet:crowdTheTails',

  surface: {
    definition:
      'Laying out a fixed number of buckets over ranked data by cutting a warped scale in equal steps, so the buckets come out narrow at the two extremes and wide through the middle.',
    exemplarKeywords: [
      'non-uniform bucketing',
      'unequal bin widths',
      'variable-width bins',
      'scale function',
      'bucket boundaries',
      'why the bins are narrower at the ends',
      'dividing a range unevenly on purpose',
      'more resolution near the extremes',
      'equal steps in a transformed coordinate',
      'partitioning by rank rather than by value',
    ],
  },

  briefing: {
    observable: [
      'Sixty points stand at evenly spaced positions along a line, because the horizontal position is the rank of a point rather than its value — nothing on screen states how large any point is.',
      'The first cut divides that line into six equal parts and the caption reports the same count in every one of them, so the even split is shown working before it is replaced.',
      'A second ruler sits above with its ticks at even spacing throughout, and thin lines fan down from those ticks to where each one lands below, so the ticks that stay even and the boundaries that do not are visible in the same frame.',
      'The boundaries then slide outward from the even split, each toward the nearer end, and the buckets under them widen in the middle and pinch at the two ends; the points do not move while this happens.',
      'Percentages appear under the boundaries once they have settled — 0, 7, 25, 50, 75, 93 and 100 — so the uneven spacing can be read as numbers and not only as widths.',
      'The points then pour down into their buckets a facing pair at a time, starting from the middle pair and working outward, piling into columns whose heights differ.',
      'The captions name the counts as they fill: fifteen in each middle bucket, eleven in the pair outside them, and only four in each end bucket, against the ten every bucket would have held under the even split.',
      'At the close each bucket collapses to a single mark whose size is the number of points it swallowed, the points themselves disappear, and the caption states the middle count, the end count and the ratio of 3.8 between them.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence on its own — even cut, slide, filling pair by pair, and the marks — and stops once each bucket holds a single mark.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, dragging the strip handle back into the slide lets a reader sit on it and watch a boundary move, forward and back.',
        'Dragging the handle to the start of the strip returns to the bare line of points before the even cut; Replay clears the drawing and plays the whole sequence again.',
        'The sixty points and the six buckets are fixed, so the boundaries at 7, 25, 50, 75 and 93 percent and the counts of four, eleven and fifteen can be named in the text and relied on.',
      ],
    },

    useWhen: [
      'The article states that a summary gives the extremes more buckets than the middle, and the reader cannot see how buckets could be unequal unless someone placed them by hand. Boundaries sliding outward under ticks that stay evenly spaced is that placement being done by arithmetic instead.',
      'A reader has to accept that the middle is being coarsened deliberately before any reason for doing so can land. Middle buckets swallowing fifteen points each while the end buckets take four puts the cost and the gain in the same picture.',
      'The prose has introduced a transformed coordinate and the reader takes the transformation for bookkeeping. Cutting evenly in one coordinate and watching the cuts arrive unevenly in the other is what makes the transformation the thing that does the work.',
    ],

    avoidWhen: [
      'The subject is how good the resulting answers are, or how to choose the number of buckets. Nothing here is queried and no estimate is checked against a true value.',
      'The article is about the shape of the data itself — where the values cluster, how heavy a tail is. The horizontal axis carries rank, and the values never appear.',
      'The subject is a histogram with equal-width bins laid out over a range of values, where the counts differ because the data does. Here the counts differ because the boundaries were placed to make them differ.',
      'The article is about keeping a sample rather than a partition — reservoir sampling, or drawing a subset to estimate from. Every point here ends up inside some bucket.',
      'The word "tail" refers to the rest of a list after its head, to a recursive call in final position, or to following a file as it grows.',
    ],

    contrastWith: [
      {
        concept: 'tDigest',
        note: 'This settles only where the boundaries fall; what those boundaries turn out to be worth once a quantile is actually asked for is the other question.',
      },
      {
        concept: 'averageTheBuckets',
        note: 'Opposite intentions behind the same act of dividing: one divides evenly so that no part can dominate the estimate, while this divides unevenly so that a chosen part is resolved more finely than the rest.',
      },
      {
        concept: 'hashToBucket',
        note: 'Both send items into a fixed number of buckets, but one wants the destination to bear no relation to the key at all, while here the destination is precisely the rank of the item and the widths are chosen from it.',
      },
    ],
  },
};

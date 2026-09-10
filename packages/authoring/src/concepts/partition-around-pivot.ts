/**
 * partitionAroundPivot 개념 선언.
 *
 * canonical facet 은 `facet:partitionAroundPivot` — 조각(piece)이다. 가운데를
 * 세로로 가르는 기준선 하나, 그 아래 끝에 박힌 기준값, 위쪽 줄에 흩어진 값 다섯,
 * 좌우로 캔버스를 채우는 두 방이 전부다. 계기도 코드 패널도 없고 컨트롤은
 * 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `quickSort` 는 가르기를 재귀로 되풀이해 줄을 세우는 **절차 전체** 를
 * 맡고, 조각 `pivotChoiceMatters` 는 기준을 어디서 고르느냐가 남는 일의 크기를
 * 정한다는 것을 맡는다. 이 조각이 홀로 맡는 것은 **한 번 가른 결과가 무엇인가**
 * 이다 — 갈린 것은 "기준보다 작다 / 크다" 두 가지뿐이고 각 쪽 안은 정렬되지
 * 않으며, 그럼에도 기준 자신의 자리는 이 한 번으로 확정된다는 것.
 * definition 의 주어가 "한 번의 재배치" 이고, keywords 는 견줌의 한쪽 끝이 늘
 * 같다는 것 · 갈림과 정렬의 구별 어휘만 갖는다 (완제품의 재귀 · 제자리 어휘,
 * 다른 조각의 최악 · 기준 고르기 어휘와 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const partitionAroundPivotConcept: FacetConceptSource = {
  id: 'partitionAroundPivot',
  label: 'Partitioning Around a Pivot (Split Is Not Sort)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:partitionAroundPivot',

  surface: {
    definition:
      'One rearrangement against a single reference value: each side ends up holding only smaller or only larger values, the reference reaches its final position, and neither side is ordered within itself.',
    exemplarKeywords: [
      'partitioning',
      'split into a smaller half and a larger half',
      'is it sorted after one split',
      'every value compared against the same one value',
      'the pivot ends up in its final position',
      'less than the pivot, greater than the pivot',
      'one pass of comparisons',
      'grouping by a threshold',
      'separating values around a cut-off',
    ],
  },

  briefing: {
    observable: [
      'A single vertical line stands in the middle with the reference value fixed at its foot, and every value comes down onto that same line to be weighed, so one end of every comparison is visibly the same value.',
      'Values are never weighed against each other — five values produce five comparisons and no more.',
      'After being weighed a value slides across the line into the left or the right room, and the two rooms fill from the line outward in the order the values arrived.',
      'The right room ends up holding 7, 9, 8 in that order, which is the arrival order rather than any ordering by size.',
      'The reference never crosses the line; the caption at that moment says its place is settled, while the rooms around it are not.',
      'The rooms are drawn as fixed areas spanning the canvas, so the uneven split — two on one side, three on the other — is left visible instead of being balanced away.',
      'The closing caption counts the two sides and states outright that the values are separated, not sorted.',
      'Values are drawn as equal-sized chips rather than bars of different heights, so nothing on screen suggests an ordering within a side.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole split on its own and stops with both rooms filled.',
        'Two buttons: Replay, and a step control that rewinds and walks the same crossings one at a time, which is how a reader can sit on a single comparison.',
        'The five values and the reference are fixed, so an article can name which value goes to which side.',
      ],
    },

    useWhen: [
      'A reader watches values being separated and concludes the job is finished. Three values sitting in one room in the order they arrived is the counter-example that has to be pointed at rather than described.',
      'The prose claims that one pass settles a value permanently, and the reader has no reason to believe a single pass could settle anything. Everything smaller being on one side and everything larger on the other, with nothing left to compare, is that argument in a form that can be seen.',
      'The article needs the reader to notice that a comparison here always has the same value on one end, which is what makes a pass cost one comparison per value.',
    ],

    avoidWhen: [
      'The subject is the whole sorting run — how many passes it takes, or how the two sides get handled afterwards. This screen ends after a single split and never revisits either side.',
      'The point is how a split is carried out inside one array without extra room. The two sides here are drawn as separate areas, and the exchanges an in-place scheme performs are not shown.',
      'The article is about splitting into three groups to handle repeated values, or about elements equal to the reference.',
      'The article uses "partition" for a disk partition, a database or Kafka partition, or dividing a set in mathematics.',
    ],

    contrastWith: [
      {
        concept: 'quickSort',
        note: 'That runs the split on range after range until everything is ordered; this runs it once and stops on the fact that being split is not yet being ordered.',
      },
      {
        concept: 'pivotChoiceMatters',
        note: 'Both perform a single split, but that one varies which value is taken as the reference and measures what is left over, while this one keeps the reference fixed and looks at what the split has and has not achieved.',
      },
      {
        concept: 'splitUntilOne',
        note: 'Two ways of cutting a range in two: that one cuts by position and can always halve, this one cuts by value and the sizes fall where the data puts them.',
      },
      {
        concept: 'inPlaceVsExtra',
        note: 'That concept is about whether the rearrangement needs a second array; here the split is shown as movement between two areas and the storage question is set aside.',
      },
    ],
  },
};

/**
 * probeAFewCells 개념 선언.
 *
 * canonical facet 은 `facet:probeAFewCells` — 조각이다. 평면이 대표끼리의
 * 수직이등분선으로 네 칸으로 갈리고, 질의가 위에서 내려앉고, 질의에서 각 대표까지
 * 자가 뻗어 잰 값이 자의 한복판에 남는다. 네 값이 모두 한 얇은 고리 안에 들며,
 * 가까운 칸부터 뚜껑이 바깥으로 밀려 나가고 드러난 점에만 살이 뻗는다. 안 연
 * 뚜껑은 끝에 한 번 되눌린다. 컨트롤은 다시 보기와 한 걸음 둘뿐이고 계기는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 지는 것은 **여는 일 자체** 다 — 대표를 재고 가까운 칸부터 열며,
 * 안 연 칸의 점은 손도 대지 않는다는 것. **재현율을 세지 않는다.** 그래서
 * definition 의 주어가 "견줌을 몇 칸 안으로 가두는 일" 이고 꼬리가 "바깥은 통째로
 * 건너뛴다" 로 닫힌다.
 *
 * 형제 `recallSpeedTradeoff` 는 덜 뒤질 때 답이 무엇을 잃는가를, 완제품
 * `invertedFileIndex` 는 정확함과 비용이 한 손잡이에 매인 것을 맡는다. 어휘도
 * 갈라 두었다 — 이쪽은 가르기 · 뚜껑 · 건너뛰기 어휘만 갖고, 참값 · 빠짐 · 조율
 * 어휘는 쓰지 않는다.
 *
 * 군집화 계열의 어휘(연결 방식 · 중심 옮기기 · 잡음 · 매개변수)는 쓰지 않는다.
 * 저쪽은 무리를 찾는 일이고 여기서는 이미 나뉜 칸이 전제다.
 *
 * "probe" 가 열린 주소법의 되짚기와 겹치므로 avoidWhen 이 그 오검출을 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const probeAFewCellsConcept: FacetConceptSource = {
  id: 'probeAFewCells',
  label: 'Probing Only a Few Partitions',
  canonicalFacet: 'facet:probeAFewCells',

  surface: {
    definition:
      'Restricting a similarity search to a few pre-partitioned regions picked by their representatives, so comparisons are made only inside those regions and everything outside them is skipped.',
    exemplarKeywords: [
      'coarse quantizer',
      'Voronoi partition of a vector space',
      'only the nearest regions get opened',
      'skipping most of the dataset',
      'candidate set drawn from a few buckets',
      'why approximate similarity search is fast',
      'narrowing what gets compared',
      'vectors that are never touched',
      'boundaries between representatives',
      'measuring against a representative instead of the data',
    ],
  },

  briefing: {
    observable: [
      'The plane is already divided when the run starts, and the divisions are the perpendicular bisectors between the representatives, so the boundaries run all the way to the edges of the frame rather than closing tidily around each representative.',
      'Each region is covered by a hatched lid with its members faintly visible underneath, which is how something can be present in the data and still unexamined.',
      'A ruler extends from the query to one representative at a time and the measured value is printed at the middle of that ruler, so the comparison being made is to a representative and not yet to any member.',
      'The four measured values land inside one thin annulus drawn around the query — 4.95, 5.45, 5.47 and 5.87 — so the ordering is decided within a narrow band and no region stands out as obviously right.',
      'Ranks are then written beside each region alongside its membership count of six, which is what makes the cost of opening one region a number the reader already has before it opens.',
      'Lids slide outward in rank order and only two of the four ever move, so the run visibly declines to look at half the data.',
      'Once a lid has moved, spokes reach from the query to its members one at a time and those members change colour — the comparison the query was after happens only here, only after the lid is gone.',
      'The closing line counts opened against total, compared against untouched, and the two lids that never moved press down once and stay shut.',
      'The vertical scale is carried over to the horizontal one, so the ordering by eye agrees with the ordering by the printed values.',
    ],

    screen: {
      affordances: [
        'The whole sequence plays by itself from the query landing to the closing count, and then the screen waits.',
        'Two buttons: Replay, and a step control that rewinds to the beginning and advances one moment per press, which is how a reader can hold the moment between a lid moving and the members under it being reached.',
        'The points, the four representatives, the query at the meeting point of the regions, and the decision to open two of four are all fixed, so the article can name the distances and the counts as they stand.',
      ],
    },

    useWhen: [
      'An article states that the index searches only the nearest partitions and the reader has no picture of what that leaves out. Half the data sitting under lids that never move, still drawn and still present, is the part the sentence was hiding.',
      'The reader assumes the right region is obvious once the query is placed. Four measurements that fall inside a narrow band make the number of regions to open a judgement rather than something read off the picture.',
      'The prose needs the step where a query is matched against representatives rather than against the data itself, and a reader who has not seen that step assumes every item was looked at and merely sorted.',
      'Someone is about to describe partitioned search as a filter applied to results. Here the members of a closed region are never reached at all, which is a different thing from being reached and rejected.',
    ],

    avoidWhen: [
      'The question is what gets lost by not opening everything. Nothing here is checked against a correct answer, and the count kept is of comparisons made rather than of items found.',
      'The subject is how the regions came to be or how the representatives were chosen. The division is in place before the first step and is never revised.',
      'The article uses "probe" for the walk along a hash table after a collision, or for the inspection of a memory address or a network host. The word matches and nothing else does.',
      'The subject is the inverted index of full-text search, where a term maps to the documents that contain it. There are no terms and no documents here.',
      'The point is a different way of avoiding a full scan — following a proximity graph, hashing near items into shared buckets, or shrinking each vector so every comparison costs less. Here every comparison is made at full size and the saving comes only from making fewer of them.',
    ],

    contrastWith: [
      {
        concept: 'recallSpeedTradeoff',
        note: 'This says what never gets looked at; that says what the not-looking costs the answer. Neither correctness nor an answer is weighed here, and the regions are not drawn there.',
      },
      {
        concept: 'invertedFileIndex',
        note: 'This claims only that the comparisons can be confined at all; that treats how many regions to consult as a setting with a price, which presumes this claim already granted.',
      },
      {
        concept: 'knn',
        note: 'Both narrow toward the nearest items, but one consults every stored example before it answers, while this one refuses to consult most of them.',
      },
      {
        concept: 'kmeans',
        note: 'The regions are given here and the only question is which to consult; there the regions themselves are what is being computed, and no query is asked of them.',
      },
      {
        concept: 'hashToBucket',
        note: 'Both send an item to a place computed from it rather than searched for, but one lands in exactly one bucket that must hold the match, while here the nearest region may not hold it and several are opened for that reason.',
      },
    ],
  },
};

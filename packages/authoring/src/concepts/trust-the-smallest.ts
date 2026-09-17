/**
 * trustTheSmallest 개념 선언.
 *
 * canonical facet 은 `facet:trustTheSmallest` — "세 줄에서 읽은 값이 저마다 다를 때
 * 왜 가장 작은 것을 믿는가" 한 질문에만 답하고 멈추는 짧은 화면이다. 줄 3 · 칸 5 의
 * 작은 표에 다섯 키가 들어가고, 물으면 세 값이 자 위에서 가라앉고 답 선이 가장 낮은
 * 값까지 내려앉는다. 참값은 같은 자 위에 점선으로 깔려 있다.
 *
 * 스스로 다 넣고 다 물은 뒤 멈춘다. 독자가 키를 넣거나 표 크기를 고르는 자리는 없고,
 * 다시 보기와 한 걸음씩 짚기만 기다린다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 말하는 것은 **읽는 규칙 하나와 그 근거**다 — 칸은 남의 셈을 함께 일 수는
 * 있어도 제 셈을 빠뜨릴 수는 없으므로 어느 줄에서 읽든 참값 이상이고, 그래서 가장
 * 작은 것이 가장 덜 틀렸다. 표를 얼마나 크게 잡을 것인가는 이쪽 말이 아니다 (그것은
 * `countMinSketch` 와 `spaceErrorTradeoff` 가 나눠 맡는다).
 *
 * 변별어를 붙이지 않은 대신 id 가 규칙 자체를 말한다 — `minEstimate` 류의 일반
 * 명사는 최솟값을 고르는 다른 모든 것과 갈리지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const trustTheSmallestConcept: FacetConceptSource = {
  id: 'trustTheSmallest',
  label: 'Taking the Smallest of the Readings',
  canonicalFacet: 'facet:trustTheSmallest',

  surface: {
    definition:
      'Answering a query over shared counters with the lowest of the values a key hashes to, an estimate that can only stand too high because a shared counter carries other additions but never omits the key\'s own.',
    exemplarKeywords: [
      'take the minimum',
      'min estimator',
      'why the smallest reading',
      'one-sided error',
      'never an undercount',
      'overestimate only',
      'point query on a sketch',
      'which row to believe',
      'shared counters inflate',
      'upper bound on a count',
      'count-min sketch read',
    ],
  },

  briefing: {
    observable: [
      'Five labelled chips across the top carry a key and how many times it arrives, and a small table of rows and columns sits under them with a number in every cell.',
      'Adding a key sends one marked token per row down into the table, and exactly one cell in each row takes the addition while the rest are left alone.',
      'Asking about a key lays a dashed line across the lower half at that key\'s true count, then lifts the readings out of their cells onto a common scale where each settles at its own height.',
      'A horizontal line then starts at the highest of the readings and descends until it rests on the lowest, and the readings it passes on the way are dimmed while the one it lands on stays marked.',
      'Whenever the resting line stops above the dashed one, the gap between them is shaded and the caption gives both numbers side by side; when they coincide the caption says the reading is exactly the true count.',
      'Two of the five keys take the same cell in every row, so their readings come out identical and one of them ends up carrying the other\'s additions on top of its own.',
      'Each chip picks up the answer it received, and the closing line states that across all five the smallest reading never fell below the true count — the resting line is never seen below the dashed one.',
    ],

    screen: {
      affordances: [
        'It adds all five keys and then asks about all five on its own, and stops on the closing line without anything being pressed.',
        'Below it are a Replay button, which empties the table and runs again, and a playback strip. After the run, dragging the strip to any query holds the descent of the answer next to the true mark.',
        'The table size and the arriving keys are fixed, and the cells a key takes are computed from the key itself, so the overlap that inflates one of the readings is a real one rather than an arrangement.',
      ],
    },

    useWhen: [
      'A reader has met the rule as a formula — the minimum over the rows — and takes it for a tie-break, a rounding convention or a way of averaging out noise. Seeing the answer descend to the lowest reading and stop, never sinking past the true mark, supplies the reason instead of the instruction.',
      'The article is about to rely on an estimate being safe in one direction, so that a threshold test or an alarm can be trusted to have no misses. The claim that a reading is never short needs to be shown once before anything is built on it.',
      'The prose says colliding keys "mix" their counts and a reader concludes the answer could come out either too high or too low. Watching a cell accept an addition without ever losing one settles which of the two can happen.',
    ],

    avoidWhen: [
      'The question is how large the table should be, or what widening it or adding rows would buy. The table stays one fixed size here and nothing about it is varied.',
      'The subject is how a key turns into a column — hash functions, their independence, or the arithmetic of the address. Where a key lands is computed but never the matter under discussion.',
      'The article needs membership rather than counts, or asks how many distinct keys appeared. Every question asked here is how many times one named key arrived.',
      'The estimates in question are combined by averaging or by taking a median rather than by keeping the lowest. Nothing here is blended — one of the readings is chosen and the others are discarded.',
      'The subject is minima generally: finding the smallest element of a collection, or a priority ordering. The smallest is taken here because of what the other readings are known to contain, not because small is what was wanted.',
    ],

    contrastWith: [
      {
        concept: 'countMinSketch',
        note: 'This settles why the lowest reading is the answer; the other takes that as given and asks how much room the counters should be given and in which direction.',
      },
      {
        concept: 'spaceErrorTradeoff',
        note: 'Both concern the inflation that shared counters cause, but one measures how it grows as the table shrinks while this one establishes that it can only ever go one way.',
      },
      {
        concept: 'averageTheBuckets',
        note: 'Both reduce error by keeping several estimates instead of one, but averaging pulls a scattered estimate toward its centre, whereas choosing the lowest trims an error known to lean in a single direction.',
      },
      {
        concept: 'severalHashesOneValue',
        note: 'One key touches several places in both, but there every place must agree before an answer is given, and here the places are compared and only one of them is kept.',
      },
      {
        concept: 'chainingBucket',
        note: 'Both start from keys landing in the same slot, but chaining keeps them distinguishable so a lookup stays exact, while here their counts are added together and the read rule has to cope with the mixture.',
      },
    ],
  },
};

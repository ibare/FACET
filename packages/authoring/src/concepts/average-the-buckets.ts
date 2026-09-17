/**
 * averageTheBuckets 개념 선언.
 *
 * canonical facet 은 `facet:averageTheBuckets` — 띠가 셋인 화면이다. 위에 열쇠
 * 열여섯이 제 ρ 를 달고 줄을 서고, 가운데 통에 쏟아졌다가 벽이 내려와 넷으로
 * 갈리며, 아래 log2 자 위에서 통마다의 답이 하나로 모인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **여럿으로 나눠 튐을 가두는 법** 이다 — 하나에 기대면
 * 운 좋은 열쇠 하나가 답을 128 로 만들고, 넷으로 나누면 그 튐이 제 통을 못 넘으며,
 * 모을 때 산술이 아니라 조화평균을 쓰는 까닭이 거기 있다는 것.
 * 형제 `leadingZerosTell` 은 눈금 하나로 셈하는 법 자체를, `hyperloglog` 는 나눔의
 * 몫을 변수로 놓고 오차와의 관계를 맡는다. keywords 도 이쪽은 분산 · 평균 · 튐
 * 어휘만 갖는다 (형제의 확률 논증 어휘, 그리고 메모리 대 정확도 어휘와 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const averageTheBucketsConcept: FacetConceptSource = {
  id: 'averageTheBuckets',
  label: 'Average the Buckets (Confining One Lucky Draw)',
  canonicalFacet: 'facet:averageTheBuckets',

  surface: {
    definition:
      'Spreading hashed keys over several registers so one unusually long run is confined to the register that owns it, then folding the separate readings together with a harmonic mean.',
    exemplarKeywords: [
      'one outlier ruins the estimate',
      'stochastic averaging',
      'split by the leading bits of the hash',
      'registers',
      'harmonic mean instead of arithmetic mean',
      'variance of a single measurement',
      'averaging many noisy readings',
      'why the arithmetic mean is dragged by a spike',
      'LogLog',
      'trap the spike in one bucket',
      'combine partial estimates',
    ],
  },

  briefing: {
    observable: [
      'Sixteen keys drop into a row at the top, each a small tile printed with its own run length, and their colours already say which of the four groups each belongs to before any wall exists.',
      'Poured into a single bin, the tiles stack by run length and one of them — outlined in a warning colour — sits far above the rest at 7, and a level line runs the whole width of the bin at its height.',
      'The single-bin answer detaches from that level line and lands on a log2 ruler at 128, labelled as the one-bucket reading, while a dashed marker on the same ruler reads True count: 16 — the miss is a distance on a ruler, not a number to be compared in the head.',
      'Walls then descend, the bins are numbered 0 to 3, and every tile slides sideways into its own bin; the level line shrinks to the width of the bin that owns the spike, which is the containment happening in one movement.',
      'Each bin raises its own level line from the floor and drops its own reading onto the ruler: 32, 8, 2 and 128 — a spread of sixty-four to one that is visible as four chips sitting far apart.',
      'The four chips then slide along the ruler into each other and become a single chip at 16.2, arriving right next to the true-count marker, and the caption names both numbers.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence on its own — stream, pour, read, split, settle, gather — and stops on the gathered answer.',
        'A Replay button and a playback strip sit underneath. Once the run has finished, dragging the strip back to the split holds the screen between the split and the readings it produces.',
        'The keys and their run lengths are fixed and taken from real murmur3 32-bit hashes of host-001 through host-016, so the numbers 128, 32, 8, 2 and 16.2 can be quoted exactly as they appear.',
        'The ruler is logarithmic, which is what lets the runaway reading and the gathered one share it without either leaving the screen.',
      ],
    },

    useWhen: [
      'A reported estimate comes out absurd — eight times the truth — and the reader reaches for a bug. One outlined tile at 7 deciding the whole answer puts the cause in the luck of a single draw instead.',
      'The prose says the readings are averaged and a reader supplies an arithmetic mean without thinking. Four readings of 32, 8, 2 and 128 collapsing to 16.2 rather than to 42.5 is the argument for which mean was meant.',
      'A reader accepts that dividing the data helps but cannot see why it would, and the walls coming down so the tall tile stops at its own wall is the mechanism rather than the assertion.',
    ],

    avoidWhen: [
      'The article is introducing why a run of zeros says anything about quantity at all. The run lengths arrive here already computed and printed on the tiles.',
      'The subject is how many registers a real implementation keeps, or how the error falls as that number grows. The division here is fixed at four and never varied.',
      'The point is counting how often each key occurred. Each tile here contributes one run length and its identity is never asked about again.',
      'The article uses "bucket" for a hash-table slot that stores the items themselves, or for a storage bucket in an object store. The word matches and the subject does not.',
    ],

    contrastWith: [
      {
        concept: 'leadingZerosTell',
        note: 'That one asserts a single longest run can stand for the count; this one starts from the failure of that assertion on an unlucky draw and is about containing it.',
      },
      {
        concept: 'hyperloglog',
        note: 'Dividing into four is one fixed remedy here, whereas the other makes the number of divisions the quantity in question and ties it to the error.',
      },
      {
        concept: 'trustTheSmallest',
        note: 'Both fold several readings into one answer, but taking the lowest is right when every reading can only err upward, while folding them together is right when each is independently noisy and no single large one should carry the result.',
      },
      {
        concept: 'countMinSketch',
        note: 'Both scatter keys into cells by hashing, but one accumulates arrivals in the cells while here a cell keeps only the most extreme run it has met and the count is inferred from that.',
      },
    ],
  },
};

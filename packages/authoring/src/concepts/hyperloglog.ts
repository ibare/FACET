/**
 * hyperloglog 개념 선언.
 *
 * canonical facet 은 `facet:hyperloglog` — 손잡이가 달린 완결형이다. 위에 열쇠
 * 하나의 32비트, 가운데 통별 최댓값 막대, 아래 왼쪽에 추정값과 참값, 아래 오른쪽에
 * 통 수에 따른 오차 축이 있다. 통 수 슬라이더(1·2·4·8·16)를 밀 때마다 같은 열쇠
 * 96 개가 그 통 수로 다시 흐르고 축에 점이 하나씩 찍힌다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **눈금 하나와 여럿 사이를 옮겨 다니며 대가를 보는 일**
 * 이다 — 통 수가 변수이고, 오차가 그 함수이며, 줄어드는 것은 평균적으로 그렇다는
 * 것까지. 형제 `leadingZerosTell` 은 통이 하나일 때의 셈법을, `averageTheBuckets`
 * 은 통이 넷일 때의 가둠을 한 장면씩 말하고 멈춘다.
 * keywords 도 이쪽만 이름(HyperLogLog · HLL) · 응용(고유 방문자 · 근사 distinct) ·
 * 메모리 대 정확도 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hyperloglogConcept: FacetConceptSource = {
  id: 'hyperloglog',
  label: 'HyperLogLog (What More Buckets Buy)',
  canonicalFacet: 'facet:hyperloglog',

  surface: {
    definition:
      'A cardinality estimator that keeps one small register per bucket of hashed keys, where the reader raises or lowers the bucket count and watches what it costs the accuracy of the count.',
    exemplarKeywords: [
      'HyperLogLog',
      'HLL',
      'cardinality estimation',
      'approximate distinct count',
      'unique visitors',
      'count distinct over a stream',
      'COUNT(DISTINCT) is too expensive',
      'APPROX_COUNT_DISTINCT',
      'PFCOUNT',
      'precision parameter',
      'relative error of the estimate',
      'memory versus accuracy',
      'sketch',
    ],
  },

  briefing: {
    observable: [
      'A key and its 32 bits sit across the top with ρ printed at the right; the leading cells are tinted as the bucket number, the run of zeros is lit in one colour and the 1 that ends it in another, so the bits are partitioned into an address and a measurement in front of the reader.',
      'Moving the bucket slider repartitions those same 32 bits — at one bucket no cells are tinted and the whole width counts the run, at sixteen the first four are address — and the caption states how many bits went to each side.',
      'The middle band holds one bar per bucket labelled with the largest run that bucket has met, and a bar changes colour only on the keys that actually raise it, so most of the ninety-six keys visibly change nothing.',
      'At the lower left the estimate is printed to one decimal beside the true count of 96 with an unsigned error percentage next to it; at every bucket setting the estimate reads below 96.',
      'At the lower right an axis carries five ticks — 1, 2, 4, 8, 16 — with unvisited ones drawn as dashed empty circles at the baseline, so the screen shows the settings not yet tried as well as the ones already read.',
      'Each completed pass drops a labelled point on that axis and joins the visited ones with a line; filling all five gives 78, 55, 21, 20 and 6 percent, where 4 and 8 land almost together — the fall is a tendency rather than a step-by-step guarantee.',
      'Two counters at the bottom, keys and raises, restart from zero on every pass, so changing the bucket count reads as asking the same question again rather than continuing the previous run.',
      'The screen finishes each pass with a caption inviting the slider to be pushed, and holds there until it is.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. One pass at four buckets plays on mount and then the screen waits for the slider.',
        'A segmented slider beside the playback controls offers 1, 2, 4, 8 and 16 buckets, starting at 4; each choice replays all ninety-six keys from the beginning at that setting.',
        'The error axis is filled only by pressing settings, so the comparison across bucket counts is something the reader assembles rather than reads off — the picture is complete after all five have been visited.',
        'The keys are fixed (host-0001 through host-0096) and every bit pattern is the real murmur3 32-bit hash of that name, so the numbers on screen can be quoted exactly.',
      ],
    },

    useWhen: [
      'The text quotes a figure like a couple of kilobytes for millions of items at a few percent error, and the reader has no way to feel that exchange. Pushing the slider and watching a point land on the axis each time turns the exchange into something the reader performed.',
      'The prose needs the whole procedure in one place — hash a key, split the bits, keep the largest run per bucket, combine them into a number — with a known truth printed beside the answer to judge it against.',
      'A reader takes more registers as merely making an answer less noisy. Every reading here falls short of the true count and two adjacent settings land almost together, which reframes the improvement as an average tendency over settings rather than a promise for each step.',
    ],

    avoidWhen: [
      'An exact count is what the article needs — billing, deduplication, anything where being off by a percentage is being wrong. Every answer here is an approximation and the error is displayed as part of the answer.',
      'The subject is how often each individual key was seen, or which keys are the most frequent. Keys here are counted once and never asked about again.',
      'The question is whether a particular item has been seen before. Nothing on this screen can be queried about a single key.',
      'The article is about merging two such summaries, or counting over a moving window. One stream is run from the start on every pass, and there is only ever one summary on screen.',
      'The word "bucket" refers to a storage bucket in an object store, or to a hash-table slot that holds the items themselves.',
    ],

    contrastWith: [
      {
        concept: 'leadingZerosTell',
        note: 'That is the claim that rarity measures quantity, stated once and left standing; this takes the claim as given and asks what accuracy costs.',
      },
      {
        concept: 'averageTheBuckets',
        note: 'Splitting into several registers is a fixed remedy there, while here the number of registers is the variable and the subject is its relation to the error.',
      },
      {
        concept: 'countMinSketch',
        note: 'Both spend a fixed handful of cells instead of one entry per key, but one answers how often a given key arrived while this answers how many different keys there were.',
      },
      {
        concept: 'bloomFilter',
        note: 'Both trade exactness for space, but one may answer yes about an item never seen, whereas this is never asked about an item at all and is wrong only about the total.',
      },
      {
        concept: 'spaceErrorTradeoff',
        note: 'Both hold that accuracy is bought with memory, but there the error inflates the count reported for one key while here it is a percentage on the number of distinct keys.',
      },
    ],
  },
};

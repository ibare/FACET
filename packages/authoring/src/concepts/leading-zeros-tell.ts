/**
 * leadingZerosTell 개념 선언.
 *
 * canonical facet 은 `facet:leadingZerosTell` — 사다리 하나와 눈금 하나가 전부인
 * 화면이다. 열쇠 여덟이 왼쪽에서 들어와 제 첫 1 의 자리까지 빔을 올리고 오른쪽으로
 * 흘러 나가며, 남는 것은 눈금 하나와 그 위의 2^ρ 딱지뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **눈금 하나로 셈하는 법** 이다 — 드문 것을 봤다는 사실이
 * 곧 많이 봤다는 말이 되는 그 한 줄. definition 의 주어가 "가장 긴 0 하나" 이고,
 * keywords 는 확률 논증과 2 의 거듭제곱 어휘만 갖는다.
 * 형제 `averageTheBuckets` 는 그 하나에 기대는 것이 무너지는 대목과 여럿으로
 * 나눠 가두는 법을, `hyperloglog` 는 그 나눔의 몫을 독자가 직접 밀어 대가를 보는
 * 일을 맡는다. 세 definition 이 각각 "하나로 센다" · "여럿으로 나눠 가둔다" ·
 * "그 사이를 옮겨 다니며 대가를 본다" 로 갈린다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const leadingZerosTellConcept: FacetConceptSource = {
  id: 'leadingZerosTell',
  label: 'Leading Zeros Tell the Count (A Single Register)',
  canonicalFacet: 'facet:leadingZerosTell',

  surface: {
    definition:
      'Estimating how many distinct items went by from one number only — the longest run of leading zeros seen across their hashes — and reading the count as two raised to it.',
    exemplarKeywords: [
      'count distinct without storing anything',
      'leading zeros in a hash',
      'longest run of zeros',
      'probabilistic counting',
      'Flajolet-Martin',
      'rho',
      'a rare pattern means many draws',
      'estimate is a power of two',
      'cardinality from one register',
      'streaming estimate with constant memory',
      'approximate unique count',
    ],
  },

  briefing: {
    observable: [
      'Keys arrive one at a time from the left as a tile carrying a name and its 32 bits, and each one slides off to the right and is gone — nothing accumulates on the screen except the notch.',
      'On each tile the leading zeros and the first 1 are in full ink while the remaining bits stay faded, and a coloured mark sits on the cell holding that first 1, so the quantity being read is located on the tile before it is used.',
      'A beam rises from the first-1 cell to the rung of a dashed ladder whose rungs are named ρ=1, ρ=2, ρ=3, and the beam falls away with the tile while the notch stays where it was put.',
      'The notch is a full-width bar that only ever moves up, and it carries a pill reading the estimate in the form 2^3 = 8, so the exponent and the answer are shown together rather than the answer alone.',
      'Eight keys go by and the notch steps up exactly three times; the captions distinguish the two cases in so many words — the first 1 is higher than the notch and it steps up, or the notch stays.',
      'The closing caption states that nothing was kept but the notch and gives the count as about 8, which is also the number of keys that went past.',
    ],

    screen: {
      affordances: [
        'The screen plays all eight keys on its own and stops with the notch and its pill still standing.',
        'Two buttons: Replay, and a step control that rewinds to an empty ladder and walks the same keys one at a time, which is how a reader can hold still on a key that does not move the notch.',
        'The keys are fixed (kiwi, elder, cherry, banana, apple, mango, fig, date) and their bit strings are the real murmur3 32-bit values for those names, so any row can be quoted exactly as it appears.',
        'The keys are ordered so the runs of zeros grow, which is why the notch climbs in visible steps rather than settling on the first key.',
      ],
    },

    useWhen: [
      'The text claims a count of distinct things can be had without keeping the things, and a reader hears a contradiction. Eight tiles passing through and one notch left standing is that claim in a form there is nothing left to doubt.',
      'The probability argument has to run backwards — not "how likely is a long run of zeros" but "what does seeing one tell me". The ladder puts rarity and quantity on the same vertical axis, so reading up the rungs is reading the inference.',
      'A reader needs to see that the memory does not grow with the stream: the answer lives in a pill attached to a single bar, and it is updated rather than appended to.',
    ],

    avoidWhen: [
      'The subject is how accurate such an estimate is, or what is done to make it trustworthy. One number is kept here, and the answer can only ever be a power of two.',
      'The article is about how many times each key was seen rather than how many different keys there were. Every key here is counted once no matter how often it shows up.',
      'The question is whether one particular item has been seen before. Nothing here can be asked about an individual key after it has gone past.',
      'The point is the hash function itself — how a string becomes a number, how well the bits are spread, or how a number becomes a table slot. The bits arrive already computed and only their leading zeros are read.',
    ],

    contrastWith: [
      {
        concept: 'averageTheBuckets',
        note: 'This says one longest run can stand for the whole count; the other begins where that fails, when a single unusually long run decides the answer on its own.',
      },
      {
        concept: 'hyperloglog',
        note: 'This is the claim that rarity measures quantity; the other treats that claim as settled and asks what accuracy costs.',
      },
      {
        concept: 'hashAvalanche',
        note: 'Both lean on a hash scattering its input across its output bits, but one measures that scattering as a property of the function while here it is the assumption that lets a run of zeros stand as evidence of quantity.',
      },
      {
        concept: 'countMinSketch',
        note: 'Both spend far less memory than there are keys, but one keeps how often each key arrived while this keeps a single number and can answer only how many different ones there were.',
      },
    ],
  },
};

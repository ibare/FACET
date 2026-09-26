/**
 * birthdayParadox 개념 선언.
 *
 * canonical facet 은 `facet:birthdayParadox` — 자리 256 의 둘레에 입력 file1 … file15 가 하나씩 들어와 이미 앉은 입력
 * 모두에게 현(짝)을 뻗는다. 짝은 0 · 1 · 3 · 6 · … · 105 로 불어나고, 찬 자리가 14 (5.5%) 뿐일 때 file15 가 file5 의
 * 자리 54 에 겹친다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `collision` 은 폭을 돌려 세 거리(반드시 · 아무 짝 · 정해진 문서)를 견준다. 이쪽은 **한 크기에서 짝이 입력보다
 * 빨리 불어나 빈 판 위에서 겹친다** 하나다. 그래서 definition 은 pairs · every earlier input · quadratic ·
 * mostly empty 를 독점하고, 출력 폭 · 2^(n/2) 사다리 · second preimage 를 쓰지 않는다.
 *
 * 전제 (설명 글 `birthdayParadox.md`): 자리 256 은 실물 2²⁵⁶ 을 줄인 것. 자리 번호는 SHA-256(입력의 ASCII) 의 마지막
 * 바이트 실측값. 입력 이름은 예. 한 번 넣어 본 기록이라 다른 목록이면 더 일찍 · 늦게 겹칠 수 있다 (P(15) ≈ 34.2%).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const birthdayParadoxConcept: FacetConceptSource = {
  id: 'birthdayParadox',
  label: 'Birthday Paradox: Pairs Outgrow Inputs',
  canonicalFacet: 'facet:birthdayParadox',

  surface: {
    definition:
      'Each new input forms a pair with every earlier one, so candidate pairs grow quadratically; with 256 hash slots the first repeat comes around the 16th input while most slots are still empty.',
    exemplarKeywords: [
      'birthday paradox',
      'birthday problem',
      'square root of N',
      'k(k-1)/2 pairs',
      'why collisions come early',
      'birthday bound',
      '23 people share a birthday',
      'probability of a hash collision',
      'random ID collision',
    ],
  },

  briefing: {
    observable: [
      'A ring of 256 empty slots with counters "Hash slots: 256", "Inputs", "Pairs" and "Filled: f / 256".',
      'Inputs enter from outside the ring one per step, file1 first. Each one, on landing, draws a chord to every input already seated — one chord per pair: "file4 → slot 93 · new pairs: 3".',
      'The Pairs counter climbs 0, 1, 3, 6, 10, 15 … 91: from the fourth input on, there are more pairs than inputs.',
      'file1 through file14 all land on different slots. The fifteenth, file15, falls on slot 54, already taken by file5: "Collision: file15 → slot 54, already taken by file5".',
      'At that moment only 14 of 256 slots are filled (5.5%) and there are 105 pairs. The run is sixteen steps including the empty start, and stops on the collision.',
      'This is one recorded run, not an average; a different list of inputs could collide earlier or later. The slot numbers are real: the last byte of SHA-256 of each input\'s ASCII. 256 slots stand in for the 2^256 of a real SHA-256 output, and the names file1 … file15 are examples. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its sixteen steps on its own and stops on the collision.',
        'A Replay button and a playback strip sit below it. Once the run has finished, scrubbing slowly through the middle steps shows the chord bundle thickening much faster than the ring fills.',
        'The inputs and slot numbers are fixed, so an article can quote the colliding pair and the counts exactly.',
      ],
    },

    useWhen: [
      'The reader expects a collision among 256 values only after a hundred or so inputs; seeing it arrive at the fifteenth, on a nearly empty ring, overturns the intuition.',
      'The article needs to justify counting pairs instead of inputs before introducing the square-root estimate.',
    ],

    avoidWhen: [
      'The article is about why collisions must exist at all. That is a counting argument over a full table; here the table is mostly empty when the collision comes.',
      'The subject is how the collision distance scales with output size, or matching one fixed target. Only one size and any-pair matching appear.',
      'The point is resolving collisions in a hash table by chaining or probing. Nothing is stored or looked up.',
      'The article needs the exact 50% threshold as the thing shown. The screen shows one run; the probabilities are not on it.',
    ],

    contrastWith: [
      {
        concept: 'pigeonholeCollision',
        note: 'Pigeonhole guarantees a collision once inputs outnumber slots. The birthday effect says a collision is likely long before that, because what grows is the number of pairs.',
      },
      {
        concept: 'collision',
        note: 'Quadratic pair growth explains one early collision at one size. Across output widths it becomes the 2^(n/2) law, distinct both from the certain bound and from the cost of matching a fixed target.',
      },
      {
        concept: 'easyOneWayHardBack',
        note: 'One-way hardness concerns recovering an input from a given output. Any two inputs meeting on some output is a much weaker goal, and it is reached far sooner.',
      },
      {
        concept: 'hashToBucket',
        note: 'Mapping keys onto a fixed set of buckets treats a shared bucket as routine. The birthday effect is why that sharing begins after only a handful of keys rather than when the buckets are nearly full.',
      },
    ],
  },
};

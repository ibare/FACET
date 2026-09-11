/**
 * rollingHash 개념 선언.
 *
 * canonical facet 은 `facet:rollingHash` — 조각(piece)이다. `abracadabra` 열한
 * 글자 줄 아래에 레일이 깔리고, 창의 값을 실은 바퀴가 그 위를 실제로 굴러간다.
 * 창이 한 칸 갈 때마다 빠지는 글자에서 `−791` 같은 칩이 위로 날아 나가고 들어오는
 * 글자로 `+3` 같은 칩이 내려와 앉는다. 지나간 자리마다 값이 레일 아래 남아 여덟
 * 개가 한 줄로 선다. 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 해시 계열과 어떻게 갈랐나
 *
 * 저장소의 해시 개념 다섯(`hashToBucket` · `hashFixedLength` · `hashAvalanche` ·
 * `pigeonholeCollision` · `severalHashesOneValue`)은 전부 주어가 **해시 함수**이고
 * 말하는 것이 **출력의 성질**이거나 **값이 닿는 자리**다. 이 개념의 주어는 함수가
 * 아니라 **갱신**이다 — 앞 창의 답에서 다음 창의 답을 상수 시간에 얻는 일. 그래서
 * definition 을 "a hash function maps ..." 로 시작하지 않고 "Deriving each
 * sliding window's value from the previous window's ..." 로 열었다. 겹치는 부분을
 * 다시 셈하지 않는다는 점에서 이 개념은 해시보다 증분 갱신 쪽에 가깝고,
 * `overlappingSubproblems` 와의 대비가 그 자리를 짚는다.
 *
 * 형제 `naiveShiftByOne` · `prefixSuffixJump` 와는 축이 다르다. 저 둘은 **한 걸음의
 * 보폭**을 다투고(한 칸이냐 더 크냐), 이쪽은 보폭을 한 칸으로 둔 채 **한 걸음의
 * 값**을 깎는다.
 *
 * 화면은 해시가 같은 자리까지만 말하고 글자로 되짚지 않는다. 거짓 양성은 화면에
 * 없으므로 observable 이 아니라 avoidWhen 이 맡는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rollingHashConcept: FacetConceptSource = {
  id: 'rollingHash',
  label: 'Rolling Hash (Carrying One Window’s Value Into the Next)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:rollingHash',

  surface: {
    definition:
      "Deriving each sliding window's value from the previous window's in constant time, by subtracting the contribution of the character that leaves and adding the one that enters instead of rereading the window.",
    exemplarKeywords: [
      'rolling hash',
      'Rabin-Karp',
      'sliding window hash',
      'update the hash in constant time',
      'subtract the outgoing character, add the incoming one',
      'recompute from scratch every window',
      'polynomial hash of a substring',
      'fingerprint of a window',
      'checksum over a sliding window',
      'hash the next substring cheaply',
      'compare a window against a pattern by number',
    ],
  },

  briefing: {
    observable: [
      'A reference band sits above the text: the four letters of the pattern and, rising into place beside them, a pill carrying the number every window will be weighed against — 459.',
      'The opening window is the expensive one and is drawn that way: its four letters light one after another before any value exists, and only then does a wheel carrying 272 drop onto a rail beneath the row.',
      'The value rides a wheel rather than sitting in a box, and when the window advances the wheel rolls the actual distance along the rail with its spoke turning, so the next value is arrived at rather than rewritten.',
      'Each advance touches exactly two cells: the departing one darkens and a chip reading −791 flies up and away from it, and a chip reading +3 descends onto the arriving cell, while the letters in between are left alone.',
      'Every position the wheel passes drops its value under the rail, so the eight windows end up standing in one readable row — 272, 914, 293, 709, 459, 668, 205, 272.',
      'At the fifth window the wheel reads 459 and both the wheel and the reference pill take the same highlight at once, then release it as the window moves on; the sweep does not stop there but carries on to the end of the text.',
      'The final window comes back to the same four letters the first one held and the value comes back to 272 with it, and both ends of the row are darkened and ticked to mark the pair.',
      'The run closes by drawing a single stroke along the rail from the first window position to the last, under a line naming eight windows and seven rolls with two letters touched per roll.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sweep unattended and stops on the closing stroke, with all eight values left standing under the rail to be compared afterwards.',
        'Two buttons: Replay, and a step control that rewinds to a bare rail and advances one moment per press, which is how a reader can stop between the chip leaving and the chip landing.',
        'The text and the pattern are fixed (abracadabra, cada) and every number is computed by the run from a fixed base and modulus rather than written in, so the values named in prose stay true and small enough to read off the wheel.',
      ],
    },

    useWhen: [
      'The prose says the value is updated "incrementally" or "in constant time per step" and the reader has no picture of what is actually done. One chip leaving and one arriving, against the letters in the middle that are never touched, is the whole of the arithmetic that claim rests on.',
      'A reader has to separate the one-off cost from the repeated one. The four letters being read one at a time at the very start, and nothing like it happening again across seven advances, puts both costs on the same screen in the order they are paid.',
      'The argument needs the value to depend only on the letters currently framed and not on the route taken to reach them. The run returning to its opening number when the opening letters come back around is that property standing on its own.',
    ],

    avoidWhen: [
      'The article is about confirming a candidate — comparing the characters once two values agree, and what to do when they agree without the letters matching. Agreement is where this stops; nothing here looks behind a value.',
      'The subject is the choice of base or modulus, or how likely two unlike windows are to agree. One fixed pair is used from beginning to end and nothing weighs it against another.',
      'The article means a value used to reach a location — a bucket, a slot, a position in an array. What is produced here is compared against another value and never used as an address.',
      'The subject is a property of the function itself: how much the output moves when the input changes, how long the output is, or why two inputs must eventually share a value. What is shown is how one output is turned into the next.',
      'The point is how far to move after a failure. The window here always advances exactly one cell, every position is examined in turn, and the sweep runs to the end of the text.',
      '"Window" in the article means a span of time over a stream, a viewport, or a flow-control window.',
    ],

    contrastWith: [
      {
        concept: 'naiveShiftByOne',
        note: 'Both walk a fixed-width window one place at a time over a text, but one pays for the whole width at every position while this carries the previous position’s answer into the next and pays for two characters.',
      },
      {
        concept: 'prefixSuffixJump',
        note: 'Two ways to spend less on the same scan: one earns a longer stride from what the pattern knows about itself, while this leaves the stride at one and makes the individual step cheap instead.',
      },
      {
        concept: 'hashToBucket',
        note: 'Both fold characters into a number by multiplying and taking a remainder, but there the number is an address to arrive at, while here it is a quantity whose whole purpose is to be turned into the next one.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'That one argues agreement between unlike inputs cannot be avoided; this one produces agreements cheaply and can therefore treat one only as a candidate, never as a conclusion.',
      },
      {
        concept: 'overlappingSubproblems',
        note: 'Both refuse to redo work already done, but there the repetition is one subproblem resurfacing on many branches and the remedy is to remember many answers, while here only the immediately preceding answer is ever needed and it is transformed rather than looked up.',
      },
    ],
  },
};

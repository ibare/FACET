/**
 * oneBitDoubleFault 개념 선언.
 *
 * canonical facet 은 `facet:oneBitDoubleFault` — 지난번 결과 하나만 기억하는 예측기를
 * `T T T N` 이 세 번 이어진 결과 열(열두 분기)에 돌리는 조각. 기억 타일이 칸을 건너며
 * 짐작을 떨어뜨리고, 틀릴 때마다 그 자리에서 뒤집힌다. 틀림은 다섯이고 그중 둘은
 * 바로 앞 틀림이 뒤집어 놓은 기억 탓이다. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 saturatingCounter 와는 **주어 층위**로 갈랐다. 저쪽은 폭을 고르는 설계
 * 결정이고, 이쪽은 가장 좁은 기억 하나가 반복문 경계에서 벌이는 한 장면이다. 이쪽은
 * 비트 수를 견주지 않는다.
 *
 * 어휘는 배타로 갈랐다. 이 definition 은 `remembers` · `last time` · `mispredicts` ·
 * `loop's exit` · `re-entry` · `flipped` · `memory` 를 갖는다. 완제품의 `bits` ·
 * `lag` · `reverses for good`, fourStateHysteresis 의 `states` · `strongly` ·
 * `weakly` · `middle` · `steps` 는 쓰지 않는다. "카운터" 라는 말도 쓰지 않는다 — 이
 * 화면에는 셈하는 것이 없고 뒤집히는 것만 있다.
 *
 * fourStateHysteresis 와는 **마주 보는 짝**이다. 이쪽은 예외 하나가 기억을 뒤집어
 * 틀림 둘을 낳는다고 말하고, 저쪽은 예외 하나로는 짐작이 뒤집히지 않는다고 말한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const oneBitDoubleFaultConcept: FacetConceptSource = {
  id: 'oneBitDoubleFault',
  label: 'One-Bit Predictor (Two Misses per Loop)',
  canonicalFacet: 'facet:oneBitDoubleFault',

  surface: {
    definition:
      "A predictor that remembers only which way a branch went last time mispredicts at a loop's exit, then mispredicts again on re-entry because that memory was flipped.",
    exemplarKeywords: [
      '1-bit branch predictor',
      'one-bit prediction',
      'last-outcome predictor',
      'predict the same as last time',
      'single history bit per branch',
      'two mispredictions per loop',
      'double misprediction at loop exit',
      'the loop exit flips the prediction',
      'wrong again on the first iteration',
      'nested loop branch misprediction',
      'branch history bit toggles',
      'why one bit is not enough',
    ],
  },

  briefing: {
    observable: [
      'Three rows run left to right under a legend (T = taken, N = not taken): memory, guess and actual. The twelve outcomes are grouped into three passes of T T T N, labelled pass 1 to pass 3, with a small gap between passes.',
      'A tile carrying the current memory walks across the columns. At each branch it drops its face into the guess row, the actual outcome is revealed, and the verdict appears.',
      'When the guess is right the tile keeps its face and the caption says the memory stays. When it is wrong the tile visibly flattens and opens on the other face, and the caption says the memory flips.',
      'The flipped tile carries that face into the next column, so the next guess is the flipped value. At the start of passes 2 and 3 that guess is N against an actual T, and the caption says the flipped memory was wrong again.',
      'Each pair of consecutive misses is joined by an arc beneath the verdicts, so the misses read as pairs straddling the gap between passes.',
      'The closing caption counts 5 misses out of 12 branches, 2 of them right after a flip. The first pass has only one miss, because memory starts at T.',
    ],

    screen: {
      affordances: [
        'The screen plays the twelve branches and the closing count on its own and then stops.',
        'A Replay button and a playback strip sit underneath. Once the run has finished, dragging the strip to the first branch of a pass is how a reader can hold the moment a flipped memory produces the second miss.',
        'The outcomes and the starting memory are fixed, so an article can name the branch where each miss falls.',
      ],
    },

    useWhen: [
      'The article introduces the simplest dynamic predictor — guess whatever the branch did last time — and the reader thinks it should be nearly perfect on a loop. The miss at the exit is expected; the second miss at the next entry is the one that has to be seen.',
      'The prose needs to motivate a predictor that does not change its mind on a single exception, and the reader must first see that one exception costs two misses when the memory is a single value.',
      'The reader has to see that the second miss is caused by the first, not by anything unusual about the branch, since the guess on re-entry is nothing but what the previous miss wrote.',
    ],

    avoidWhen: [
      'The subject is comparing counters of different widths or choosing how wide to make one. Only a single remembered value is run here.',
      'The article is about the four states of a two-bit counter or when such a counter changes its guess. No state other than taken and not taken exists here.',
      'The subject is using recent history to select among several predictors, or detecting repeating patterns. The memory here holds one outcome and forgets everything before it.',
      'The article is about the cycles lost after a wrong guess or how the pipeline recovers. Misses are counted, never priced.',
      'The article uses "one bit" for a parity bit, a flag, a single-bit error or a bit flip caused by radiation. The flip here is a deliberate update after a wrong guess.',
    ],

    contrastWith: [
      {
        concept: 'fourStateHysteresis',
        note: 'The opposite claim about the same exception: with a single remembered value one contrary outcome overturns the guess and costs a second miss, with four states one contrary outcome is absorbed and the guess survives.',
      },
      {
        concept: 'saturatingCounter',
        note: 'This is the narrowest setting and the single cost it carries; that treats width as a choice and weighs this cost against the slowness a wider memory brings.',
      },
      {
        concept: 'backwardTaken',
        note: 'A fixed rule that backward jumps are taken misses only at the loop exit and never on re-entry, because it does not update; this predictor updates, and the update is what makes the second miss.',
      },
      {
        concept: 'patternFromHistory',
        note: 'That keeps several past outcomes and learns that N follows T T T, so even the loop exit can be predicted; this keeps one outcome and can only repeat it.',
      },
    ],
  },
};

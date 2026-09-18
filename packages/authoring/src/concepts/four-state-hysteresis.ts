/**
 * fourStateHysteresis 개념 선언.
 *
 * canonical facet 은 `facet:fourStateHysteresis` — 네 칸 사다리(강한 안탐 0 · 약한
 * 안탐 1 · 약한 탐 2 · 강한 탐 3)를 결과 열 `T T T N T T N N T T T` 위로 한 칸씩
 * 오르내리는 조각. 강한 탐에서 출발한다. 첫 N 은 선을 넘지 못하고, N 둘은 넘는다. 그
 * 직후 T 가 와서 짐작이 곧장 되돌아간다. 열한 분기에 틀림 넷, 짐작이 뒤집힌 횟수
 * 둘. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 saturatingCounter 와는 **주어 층위**로 갈랐다. 저쪽은 폭을 얼마로 할지의
 * 설계 결정이고, 이쪽은 폭이 정해진 뒤 한 결과가 들어올 때 무슨 일이 일어나는지 —
 * 상태 기계의 규칙 하나다. 이쪽은 폭을 견주지 않는다.
 *
 * 어휘는 배타로 갈랐다. 이 definition 은 `four-state` · `steps` · `strongly` ·
 * `weakly` · `crosses the middle` 을 갖는다. 완제품의 `bits` · `ride out` ·
 * `lag` · `reverses for good`, oneBitDoubleFault 의 `remembers` · `flipped` ·
 * `exit` · `re-entry` · `mispredicts` 는 쓰지 않는다. `loop` 도 쓰지 않는다 — 이
 * 화면의 결과 열은 반복문으로 묶여 그려지지 않는다.
 *
 * oneBitDoubleFault 와는 **마주 보는 짝**이다. 저쪽은 예외 하나가 기억을 뒤집는다고
 * 말하고, 이쪽은 예외 하나로는 짐작이 뒤집히지 않는다고 말한다.
 *
 * id 의 `hysteresis` 는 공학 일반의 낱말이라 자기 이력 · 온도 조절기 · 슈미트
 * 트리거 글이 걸릴 수 있다. avoidWhen 에서 밀어낸다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fourStateHysteresisConcept: FacetConceptSource = {
  id: 'fourStateHysteresis',
  label: 'Two-Bit Counter States (Hysteresis in Branch Prediction)',
  canonicalFacet: 'facet:fourStateHysteresis',

  surface: {
    definition:
      'A four-state branch counter steps once per result between strongly and weakly taken or not taken, and its guess changes only when a step crosses the middle.',
    exemplarKeywords: [
      'strongly taken',
      'weakly taken',
      'weakly not taken',
      'strongly not taken',
      '2-bit counter state diagram',
      'four states of a branch predictor',
      'hysteresis in branch prediction',
      'must be wrong twice before changing',
      'one wrong guess does not change the prediction',
      'increment on taken, decrement on not taken',
      'counter state transition',
      'weak state flips back immediately',
    ],
  },

  briefing: {
    observable: [
      'The four states lie as horizontal rungs across the canvas, labelled 0 · strongly not taken, 1 · weakly not taken, 2 · weakly taken and 3 · strongly taken, with a middle line between rungs 1 and 2.',
      'The side of the line holding the current guess is shaded and labelled guess T or guess N; the shading moves across the line only when the marker does.',
      'For every branch the marker moves one column right and then one rung up on T or down on N, leaving a path behind it. At the top rung it bumps the ceiling and comes back, and the caption says the state stays.',
      'Starting at strongly taken, the first N drops the marker to weakly taken and the caption says the line was not crossed and the guess stays T.',
      'Later two N outcomes in a row carry it across the line to weakly not taken, and the guess becomes N — then the very next T is guessed wrong and carries it straight back across.',
      'The outcome row marks each past branch right or wrong and dims the ones still to come. A running wrong count sits at the top, and the closing captions give 4 wrong out of 11 branches and 2 guess flips.',
    ],

    screen: {
      affordances: [
        'The screen plays the eleven branches and the closing count on its own and then stops.',
        'A Replay button and a playback strip sit underneath. Once the run has finished, dragging the strip to the branch after the first N is how a reader can hold the moment the state falls a rung while the guess stays where it was.',
        'The outcomes and the starting state are fixed, so an article can name the branch where the guess finally changes.',
      ],
    },

    useWhen: [
      'The article draws the two-bit counter as a state diagram and the reader needs the diagram set in motion: each result moves exactly one rung, and only one of the three boundaries between rungs changes the guess.',
      'The prose claims a single contrary result is tolerated and the reader should see it both ways — one N is absorbed without changing the guess, and two in a row are not.',
      'The reader has to see the cost of the weak states: right after the guess turns, a single result the other way turns it back, and that result is guessed wrong.',
    ],

    avoidWhen: [
      'The subject is choosing how many bits a counter should have or comparing widths. The counter here always has four states.',
      'The article is about hysteresis in magnetism, a thermostat, a Schmitt trigger or a control loop. Only a branch counter is shown, and its thresholds are rungs, not voltages or temperatures.',
      'The subject is how a predictor picks which counter a branch uses, or how global history selects one. One counter runs alone here.',
      'The article is about the pipeline cost of a misprediction. Wrong guesses are counted, never priced.',
      'The subject is a general finite state machine or a traffic-light style controller. Only the up-and-down counter rule appears here.',
    ],

    contrastWith: [
      {
        concept: 'oneBitDoubleFault',
        note: 'The opposite claim about the same exception: with four states one contrary result is absorbed and the guess survives, with a single remembered value one contrary result overturns it and the next branch pays too.',
      },
      {
        concept: 'saturatingCounter',
        note: 'This fixes the counter at two bits and states the rule for when its guess changes; that claims no width is best on both counts, since the extra patience that absorbs an exception is the same patience that delays following a real change.',
      },
      {
        concept: 'patternFromHistory',
        note: 'A counter summarises only which way a branch leans; history-based prediction remembers the order of recent results and can anticipate an alternation a counter keeps getting wrong.',
      },
      {
        concept: 'integerOverflow',
        note: 'Both deal with a value reaching the end of its range; there it wraps to the other end, here it stops at the end rung so that a long run is not undone by one result.',
      },
    ],
  },
};

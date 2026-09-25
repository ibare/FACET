/**
 * timeSliceRotate 개념 선언.
 *
 * canonical facet 은 `facet:timeSliceRotate` — 몫 2 의 라운드 로빈. A(0, 5) · B(0, 3) · C(0, 2) · D(4, 1). 몫을 다
 * 쓰고도 남은 것은 CPU 에서 내려와 줄 끝으로 돌아간다. 줄 끝으로 돌아간 것은 모두 셋(A 둘 · B 하나).
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (완제품 `roundRobinQuantum` 아래 조각 둘)
 *
 * 완제품은 몫을 1 ~ 5 로 쓸고 바꾸는 비용을 더해 끝이 밀리는 것을 쥔다. 형제 `quantumSizeTradeoff` 는 두 몫의
 * 바뀜 수와 첫 응답을 견준다. 이쪽은 몫 하나에서의 한 동작 — **몫을 다 썼는데 남았으면 줄 끝으로 돌아가고,
 * 남은 양이 0 이 된 것만 떠난다** — 하나다. definition 은 expires · re-enters at the tail · remaining time ·
 * circles 를 독점하고, 몫의 크기를 견주는 낱말(smaller · more switches · sooner)을 쓰지 않는다.
 *
 * 전제: 틱 단위, CPU 하나, 입출력 없음, 바꾸는 비용 0. 같은 틱에 도착과 몫 다 씀이 겹치면 도착한 것이 먼저 줄에 선다
 * (운영체제마다 다를 수 있다). 몫 안에 끝나면 몫을 다 채우지 않는다. 값은 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const timeSliceRotateConcept: FacetConceptSource = {
  id: 'timeSliceRotate',
  label: 'Round Robin (Slice Expires, Back of the Queue)',
  canonicalFacet: 'facet:timeSliceRotate',

  surface: {
    definition:
      'In round robin, a process whose time slice expires before it finishes is taken off the CPU and re-enters the ready queue at the tail with its remaining time, circling until nothing is left.',
    exemplarKeywords: [
      'round robin scheduling',
      'time slice',
      'time quantum expired',
      'timer interrupt preemption',
      'preempted process goes to the end of the queue',
      'remaining burst time',
      'round robin trace',
      'circular queue scheduling',
      'time sharing',
    ],
  },

  briefing: {
    observable: [
      'A CPU slot with a "Quantum" gauge sits above a "Ready queue" whose end is marked "Back of the line"; there are also "Done" and "Not yet arrived" areas. Each process card has cells for the ticks it needs — used cells empty, remaining cells filled — and a dot for every trip back to the line. A loop runs from above the CPU to the back of the line; a process whose slice runs out travels along it.',
      'The slice is 2 ticks ("Quantum in ticks: 2"). A needs 5, B 3, C 2, all present at tick 0; D needs 1 and arrives at tick 4 ("Arrives: tick 4").',
      'At tick 2 A has used its slice with 3 left: "Quantum used up: A → back of the line (left: 3)", and B goes up.',
      'At tick 4 two things coincide: D arrives and B uses up its slice. The arrival joins the line first and B behind it, so the line becomes A · D · B and D reaches the CPU before B.',
      'A job that finishes inside its slice leaves early: C runs ticks 4–6 and is done, and A goes up at once; D uses only 1 tick. A runs in three stretches — [0, 2), [6, 8), [10, 11) — B in two, C and D in one.',
      'Finishes: C at 6, D at 9, B at 10, A at 11, each tagged with its tick in "Done". The run ends "Finished: A (tick 11) · Trips back to the line: 3" — two for A and one for B. Waits are A 6 · B 7 · C 4 · D 4, averaging 5.25.',
      'Ticks and lengths are example values; one CPU, no I/O, switching costs nothing. The order at tick 4 — arrival before the returning process — is a chosen rule; operating systems differ here, and the opposite choice changes everything after it.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one tick boundary per step, and stops when A finishes at tick 11.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to tick 4 holds the moment D slips into the line ahead of the returning B.',
      ],
    },

    useWhen: [
      'The article introduces round robin and needs the reader to see an unfinished process leave the CPU and rejoin at the end, carrying what it has left.',
      'The article traces a round-robin schedule by hand and must settle what happens when an arrival and an expired slice fall on the same tick.',
    ],

    avoidWhen: [
      'The article is about choosing the size of the time slice or the cost of switching. Only one slice is used and switches are free.',
      'The subject is round-robin load balancing across servers or DNS round robin. This is one CPU\'s ready queue.',
      'The point is preemption by priority. Every process here is equal and leaves only because its slice ran out.',
    ],

    contrastWith: [
      {
        concept: 'quantumSizeTradeoff',
        note: 'Returning to the back is the rule itself. How large the slice should be — frequent turns against frequent switches — is a question about how often the rule fires.',
      },
      {
        concept: 'roundRobinQuantum',
        note: 'The rotation is the mechanism. Its price depends on the slice size and on what each switch costs, and a slice as long as the longest job turns round robin into first-come first-served.',
      },
      {
        concept: 'demoteOnOveruse',
        note: 'In round robin an expired slice costs a place in the same line. In a multilevel feedback queue it costs a level, and the next slice is longer.',
      },
      {
        concept: 'priorityPreempt',
        note: 'Both take a running process off the CPU with work left. Round robin does it when time runs out; priority preemption does it when someone more important arrives.',
      },
    ],
  },
};

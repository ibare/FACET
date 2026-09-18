/**
 * pipelineBubble 개념 선언.
 *
 * canonical facet 은 `facet:pipelineBubble` — `lw r1, 0(r2)` 바로 뒤의 `add r3, r1, r4`.
 * 적재 값은 MEM 끝에야 나오므로 한 사이클 멈추고, 그 자리에 생긴 빈 칸이 EX → MEM → WB
 * 로 명령어처럼 흘러 나가 WB 를 떠난 줄에 사이클 하나짜리 구멍을 남긴다. 네 명령어가
 * 8 이 아니라 9 사이클에 끝난다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 주어는 **빈 칸 자체**다 — 멈춘 명령어도(readBeforeWrite 의 `held` · `decode`), 값이
 * 건너가는 길도(operandForwarding 의 `bypass` · `latch`), 대처의 견줌도(dataHazard 의
 * `reordering` · `wrong results`) 아니다. 이쪽의 낱말은 `load-use` · `empty slot` ·
 * `travels` · `writes nothing` · `one cycle later` 다.
 *
 * 시간 축으로도 갈렸다 — readBeforeWrite 는 기다림이 **생기는** 사이클, 이쪽은 그 뒤
 * 빈 칸이 **끝까지 흘러가는** 사이클들이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pipelineBubbleConcept: FacetConceptSource = {
  id: 'pipelineBubble',
  label: 'Pipeline Bubble (the Empty Slot After a Load)',
  canonicalFacet: 'facet:pipelineBubble',

  surface: {
    definition:
      'A load-use pair forces a one-cycle pause, and the empty slot left behind travels through the later stages like an instruction, writes nothing, and makes everything behind it finish one cycle later.',
    exemplarKeywords: [
      'pipeline bubble',
      'load-use hazard',
      'load-use stall',
      'load delay slot',
      'nop inserted by the hardware',
      'pipeline stall cycle',
      'wasted cycle in the pipeline',
      'CPI greater than one',
      'one-cycle penalty after a load',
      'even forwarding cannot help after a load',
      'scheduling an independent instruction after a load',
    ],
  },

  briefing: {
    observable: [
      'Three rows stand from top to bottom: instructions waiting to be fetched, the five stages IF, ID, EX, MEM and WB, and a row of what has come out of WB, each tagged with its finishing cycle.',
      'In ordinary cycles the caption says everything moves one stage to the right, and every token does.',
      'In cycle 4 the load I1 is still in MEM fetching r1 while I2, add r3, r1, r4, would need it in EX; I2 stays in ID and I3 stays in IF, both marked held, and an empty token labelled bubble is pushed out of ID into EX.',
      'In cycle 5 the loaded r1 = 20 is passed from MEM/WB into EX, I2 computes r3 = 25, and the bubble moves on to MEM.',
      'The bubble keeps going exactly like an instruction: when it reaches WB the caption says nothing is written back in that cycle, and when it leaves, the row of finished work shows a hole at that cycle.',
      'The finished row shifts one place left each cycle, so the hole travels along with the finished instructions rather than vanishing.',
      'The closing caption gives the finishing cycle 9, one cycle lost to stalls, and the 8 it would have been without them.',
    ],

    screen: {
      affordances: [
        'The screen plays all four instructions through on its own and stops with the hole standing in the finished row.',
        'A Replay button and a playback strip sit underneath. Dragging the strip back is how a reader can stop on the cycle the bubble enters EX, or the cycle it reaches WB and nothing is written.',
        'The four instructions, the base register and the memory word are fixed, so an article can quote the loaded 20, the 25 computed from it, and the finishing cycles 9 and 8.',
      ],
    },

    useWhen: [
      'The reader has heard that the pipeline "stalls" and imagines the whole machine freezing; the empty token that keeps moving through MEM and WB while the instructions ahead of it keep finishing is the correction.',
      'The article claims that the value of a load comes too late for even the fastest early path and needs one concrete cycle that shows why exactly one cycle, and not zero or two, is lost.',
      'The prose explains the cost of a stall in finishing time, and the hole in the finished row at a named cycle turns a count of lost cycles into something that can be pointed at.',
    ],

    avoidWhen: [
      'The subject is bubble sort, a speculative market bubble, or a filter bubble.',
      'The article is about a CI/CD pipeline, a data or ML pipeline, or shell pipes. The pipeline here is inside a processor core.',
      'The subject is the cycles thrown away after a mispredicted branch. The empty slot here comes from waiting on data, and no fetched work is discarded.',
      'The article is about a cache miss stalling the processor for many cycles. The load here always takes the same single MEM stage.',
      'The subject is comparing several ways of dealing with dependent instructions. One case with one outcome is shown.',
    ],

    contrastWith: [
      {
        concept: 'readBeforeWrite',
        note: 'That is about the instruction that cannot read yet and why it must wait; this is about what the wait turns into — an empty slot that occupies each later stage in turn and delays everything behind it.',
      },
      {
        concept: 'operandForwarding',
        note: 'Forwarding is what makes most waits vanish; a bubble is the wait that survives it, because a loaded value exists one stage later than an arithmetic result.',
      },
      {
        concept: 'dataHazard',
        note: 'This claims one wasted cycle is unavoidable once a loaded value is used at once; the data hazard claims such cycles are one cost among several, to be traded against speed and correctness and removable by a different instruction order.',
      },
      {
        concept: 'branchFlush',
        note: 'Both leave empty slots flowing through the pipeline, but a flush empties slots that already held wrongly fetched instructions, while a bubble is inserted because the needed data is late and nothing is thrown away.',
      },
      {
        concept: 'throughputNotLatency',
        note: 'The ideal of one finished instruction per cycle is what throughput rests on; a bubble is a single cycle in which that promise is broken, so completion rate falls below one per cycle even though every stage still takes a single cycle.',
      },
    ],
  },
};

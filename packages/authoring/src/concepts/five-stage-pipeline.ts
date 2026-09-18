/**
 * fiveStagePipeline 개념 선언.
 *
 * canonical facet 은 `facet:fiveStagePipeline` — 서로 기대지 않는 명령어 N 개를
 * IF · ID · EX · MEM · WB 다섯 단계에 흘리고, 같은 N 개를 하나씩 돌린 기계와 한 박자
 * 축 위에서 견주는 화면이다. 손잡이로 N 을 1 · 2 · 4 · 8 · 16 사이에서 바꾸면 판이
 * 다시 돌고, 두 끝의 간격과 꽉 찬 가운데 구간이 함께 늘어난다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 조각 둘이 각각 "박자마다 무엇이 움직이는가"(stageOverlap) 와 "한 명령어의
 * 시간은 그대로다"(throughputNotLatency) 를 쥐고 있다. 이 개념은 그 둘 어느 쪽도
 * 아닌 **명령어 수를 바꿔 가며 총 박자를 세는 일** 을 주어로 삼는다 — N+4 대 5N,
 * 그리고 채움 · 비움 여덟 박자 때문에 다섯 배에 닿지 않는다는 것.
 *
 * 어휘 배타: definition 에 latency · throughput (throughputNotLatency 의 낱말) 과
 * clock · in flight · admit (stageOverlap 의 낱말) 을 넣지 않았다. 화면에 지연 괄호가
 * 있지만 대표 낱말은 조각이 독점하게 두었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fiveStagePipelineConcept: FacetConceptSource = {
  id: 'fiveStagePipeline',
  label: 'Five-Stage Pipeline (Cycle Count as Instructions Grow)',
  canonicalFacet: 'facet:fiveStagePipeline',

  surface: {
    definition:
      'Cycle accounting for a five-stage instruction pipeline as the instruction count grows: N instructions finish in N+4 cycles instead of 5N, and the fill and drain cycles keep the speedup below fivefold.',
    exemplarKeywords: [
      'classic RISC pipeline',
      'IF ID EX MEM WB',
      'MIPS five-stage pipeline',
      'pipeline speedup',
      'N plus k minus 1 cycles',
      'pipeline fill and drain',
      'ideal speedup equals number of stages',
      'pipelined versus non-pipelined execution time',
      'stage utilization',
      'instruction pipelining',
      'why pipelining is not exactly k times faster',
    ],
  },

  briefing: {
    observable: [
      'Five stage boxes labelled IF, ID, EX, MEM and WB sit in a row; instructions leave a waiting stack on the left, move one box to the right per cycle, and pile onto a Done stack on the right after WB.',
      'Below the machine runs one cycle axis carrying both machines: a pipelined row of columns whose height is the number of busy stages in that cycle, and a grey one-at-a-time bar made of five-cycle segments, one segment per instruction.',
      'The pipelined row rises one stage at a time for four cycles, holds all five for a stretch shaded yellow, then falls one stage at a time for four cycles; the caption names how many cycles were full and how many were filling and draining.',
      'An orange bracket on the axis marks, for the instruction that just left WB, the span back to the cycle it entered IF. It slides right as instructions retire and its length stays at five.',
      'End markers for the two machines sit on the axis with a gap bracket between them labelled in extra cycles; raising the instruction count pushes the pipelined end back one cell per instruction and the one-at-a-time end five cells, so the gap widens.',
      'When the count is changed, the previous round leaves a dotted outline on the pipelined row, and only the full middle stretch is longer — the two slopes are unchanged.',
      'The final caption reports pipelined cycles, one-at-a-time cycles, the speedup percentage and the percentage of stage slots that were busy; at sixteen instructions that is 20 against 80 cycles, 400%, and 80% busy.',
      'Four meters track pipelined cycles, one-at-a-time cycles, cycles for one instruction (fixed at 5) and speedup percent.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. One round plays at four instructions and then waits.',
        'An Instructions control offers 1, 2, 4, 8 and 16; choosing a value replays the round with that many instructions, and this is the handle the argument turns on.',
        'The sixteen instructions are independent register operations, so no instruction ever waits on another and every number on screen follows from the count alone.',
        'The code panel starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side. It counts pipelined cycles, one-at-a-time cycles and the speedup with the same formulas as the meters.',
      ],
    },

    useWhen: [
      'The article derives the k + N − 1 cycle formula, or states that a k-stage pipeline gives at most k times the speed, and the reader should watch the ratio climb toward five without reaching it as the instruction count goes from 1 to 16.',
      'The reader needs to see where the lost speedup goes: the four rising and four falling cycles are drawn as slopes on either side of a full stretch, and only the stretch grows with the count.',
      'The prose sets a pipelined processor against one that finishes each instruction before starting the next and wants both totals on a single cycle axis, with the gap between them opening as more instructions are fed in.',
    ],

    avoidWhen: [
      'The article is about instructions that depend on each other, stalls, bubbles or forwarding. Every instruction here is independent and nothing ever waits.',
      'The subject is branches, mispredictions or flushing fetched instructions. The program is straight-line.',
      'The article is about deeper or superscalar pipelines, or issuing several instructions per cycle. Exactly five stages and one entry per cycle are shown.',
      'The subject is how the clock period is set by the slowest stage or by the latches between stages. Every stage takes exactly one cycle and register overhead is not modelled.',
      'The article uses "pipeline" for a data-processing or CI/CD pipeline, or for shell pipes.',
    ],

    contrastWith: [
      {
        concept: 'stageOverlap',
        note: 'That is the rule that moves instructions from one cycle to the next; this totals the cycles that rule produces and asks how the total scales with the number of instructions.',
      },
      {
        concept: 'throughputNotLatency',
        note: 'That claims the time for one instruction does not shrink; this takes that as given and measures what does shrink — the total for many — and why it stops short of the stage count.',
      },
      {
        concept: 'dataHazard',
        note: 'The totals here assume no instruction needs another\'s result; a hazard is exactly the case where that assumption fails and cycles are added to the count.',
      },
      {
        concept: 'controlHazard',
        note: 'A pipeline fetches ahead on the assumption that the next instruction is the one in sequence; a branch breaks that assumption. This counts the gain when the assumption holds; that one is about the fetched instructions lost when it fails.',
      },
      {
        concept: 'outOfOrderExecution',
        note: 'Both aim to keep execution units busy, but this keeps program order and gains only by starting instructions earlier in sequence, whereas reordering lets a later ready instruction pass a waiting earlier one.',
      },
    ],
  },
};

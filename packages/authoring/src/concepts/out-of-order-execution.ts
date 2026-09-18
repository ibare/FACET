/**
 * outOfOrderExecution 개념 선언.
 *
 * canonical facet 은 `facet:outOfOrderExecution` — 적재 둘이 섞인 명령어 여덟을 한 박자에
 * 둘까지 시작하는 기계로 돌리고, 창 크기 손잡이(1 · 2 · 4 · 8)를 바꿀 때마다 한 판을
 * 새로 재생하는 화면이다. 끝나는 박자는 15 · 13 · 12 · 8, 앞지름은 0 · 0 · 2 · 4 로 간다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 둘이 이 화면의 두 장면을 하나씩 가져간다. `dualIssue` 는 순서대로 내는 기계가
 * 한 박자에 둘을 짝짓는 규칙, `readyFirst` 는 먼저 끝나도 커밋은 원래 순서라는 보장이다.
 *
 * 이쪽은 **손잡이 하나로 여러 판을 잇는 전체**라서 주어를 "창의 크기" 로 잡았다 —
 * 얼마나 멀리 내다볼 수 있는가가 적재 뒤의 빈 박자를 얼마나 메우는가. 그래서 definition
 * 은 형제가 독점하는 낱말(짝 · 두 자리 · 커밋 · 재정렬 버퍼 · 앞지름)을 쓰지 않는다.
 * exemplarKeywords 에서도 reorder buffer · retire · pairing 은 형제에게 남겼다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const outOfOrderExecutionConcept: FacetConceptSource = {
  id: 'outOfOrderExecution',
  label: 'Out-of-Order Execution (Instruction Window Size)',
  canonicalFacet: 'facet:outOfOrderExecution',

  surface: {
    definition:
      'The instruction window, how many of the oldest not-yet-committed instructions a processor may choose among, decides how many cycles stalled behind a slow load get filled by independent later instructions.',
    exemplarKeywords: [
      'out-of-order execution',
      'OoO CPU',
      'dynamic scheduling',
      'instruction window size',
      'scheduler lookahead',
      'latency hiding',
      'instruction-level parallelism',
      'ILP',
      'IPC',
      'instructions per cycle',
      'stall behind a cache miss',
      'why modern CPUs run instructions out of order',
    ],
  },

  briefing: {
    observable: [
      'Eight instruction cards cross four rows: program order on top, then the order they actually started in, then a commit line, then the committed row. Only the second row is arranged by start order, so a card that jumps ahead visibly climbs upward as it moves into it.',
      'A ruler under the rows gives every cycle two start slots. With a narrow window the slots behind the first load stay empty and the caption says nothing in the window can start; widening the window fills them with later cards.',
      'Each cycle the caption names what started, and when a later instruction starts while an older one still waits it says "overtake" and names both.',
      'A finished card returns to its own program position on the commit line and leaves only after everything above it has left; with window 8, five cards leave in a single cycle.',
      'When a run ends, the end marker slides from where the previous run finished to the new position, and the Cycles, IPC % and Overtakes metrics settle at the run\'s totals: 15, 13, 12 and 8 cycles for windows 1, 2, 4 and 8, with 0, 0, 2 and 4 overtakes.',
      'Window 2 only pairs neighbours that do not depend on each other and overtakes nothing; the first overtake appears at window 4, and at window 8 the second load starts early enough to pull the finish in to 8 cycles.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A "Window size" control with the values 1, 2, 4 and 8 is the handle that carries the argument. It starts at 1; after a run finishes, choosing another value plays a fresh run with that window from the first instruction.',
        'The eight instructions, the latencies (load 4 cycles, add and sub 1) and the limit of two starts per cycle are fixed, so an article can quote the cycle count and overtake count for any window size.',
        'A code panel titled "Counting cycles" starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article claims a processor hides memory latency by finding other work, and the reader needs to see that the amount recovered depends on how far ahead it may look — the same program ends in 15 cycles or 8 depending only on that distance.',
      'The reader expects any lookahead at all to help, and the screen shows a small widening that shaves two cycles without reordering anything, before a wider one finally lets a later instruction jump ahead.',
      'The article gives an IPC figure and the reader needs a concrete sense of what the empty issue slots behind a slow load look like and how they get occupied.',
    ],

    avoidWhen: [
      'The subject is register renaming or false dependencies (WAR, WAW). No destination register here is reused, so renaming never comes up.',
      'The article is about the internals of Tomasulo\'s algorithm, reservation stations or the common data bus. The machine here is described only by its window and its limit on starts per cycle.',
      'The topic is branch prediction or speculative execution past a branch. The program has no branches.',
      '"Out of order" refers to network packets, message delivery or event ordering in a distributed system.',
    ],

    contrastWith: [
      {
        concept: 'readyFirst',
        note: 'Both let later instructions start early; this measures how much a wider lookahead buys in cycles, while ready-first is the guarantee that results still become visible in program order.',
      },
      {
        concept: 'dualIssue',
        note: 'Issuing two per cycle in strict order stalls the moment the front instruction must wait; letting later independent instructions go first is what removes that stall.',
      },
      {
        concept: 'pipelineBubble',
        note: 'A bubble leaves the waiting cycle empty; out-of-order execution tries to fill that same cycle with unrelated later work.',
      },
      {
        concept: 'dataHazard',
        note: 'A data hazard is the dependency that forces the wait; out-of-order execution does not remove it but keeps the rest of the program moving around it.',
      },
    ],
  },
};

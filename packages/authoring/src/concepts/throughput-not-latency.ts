/**
 * throughputNotLatency 개념 선언.
 *
 * canonical facet 은 `facet:throughputNotLatency` — 같은 명령어 다섯을 파이프라인이
 * 없는 기계(위 줄)와 다섯 단계 파이프라인(아래 줄)이 한 시계로 나란히 돌리는 화면이다.
 * 받이에 닿은 명령어마다 들어간 사이클과 나온 사이클이 붙고, 그 폭은 두 줄 모두 다섯
 * 사이클이다. 갈리는 것은 다 나오는 때뿐 — 사이클 9 대 25.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 재생 막대만 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 마주 보는 짝: 지키는 것(한 명령어가 안에 머무는 시간) 과 바꾸는 것(나오는 간격) 을
 * 한 문장에 엇갈려 놓았다. latency · throughput 두 낱말은 이 개념이 독점한다 —
 * 형제 둘의 definition 에는 0 건이다. 반대로 형제의 낱말(clock · in flight · admit /
 * speedup · fill · drain · N+4)은 여기 definition 에 넣지 않았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const throughputNotLatencyConcept: FacetConceptSource = {
  id: 'throughputNotLatency',
  label: 'Throughput, Not Latency (What Pipelining Actually Speeds Up)',
  canonicalFacet: 'facet:throughputNotLatency',

  surface: {
    definition:
      'Pipelining leaves the latency of each individual instruction unchanged — entry to exit still spans every stage — and raises only throughput, the rate at which finished instructions come out.',
    exemplarKeywords: [
      'latency versus throughput',
      'pipelining does not make an instruction faster',
      'instructions per cycle',
      'time for one instruction',
      'completion rate',
      'one instruction finishes every cycle',
      'bandwidth versus delay',
      'pipelining misconception',
      'time between results',
    ],
  },

  briefing: {
    observable: [
      'Two machines run side by side on one shared clock: the top row is labelled Not pipelined and the bottom row Pipelined, each with the same five stage cells and the same five instructions waiting on the left.',
      'Instruction tiles travel through the stage cells into a tray on the right; each tile that lands is labelled with the cycles it spent inside, and every label on both rows spans five cycles.',
      'The first instruction leaves both machines at cycle 5, and the caption says so — the two rows are level for the first result.',
      'After that the pipelined row releases one instruction per cycle (5, 6, 7, 8, 9) while the other row releases one every five cycles; each row carries a count of how many are out.',
      'At cycle 9 the pipelined tray is full while the other machine has one out; the playback then jumps from release to release, and the other machine finishes at cycle 25, sixteen cycles later.',
      'Every release caption repeats that the instruction was still five cycles inside, on either machine.',
    ],

    screen: {
      affordances: [
        'The screen runs both machines to the end on its own and stops when the second tray is full.',
        'Under it sit a Replay button and a playback strip. Dragging the strip handle back to cycle 9 is how a reader can compare a full tray with a tray holding one.',
        'The five instructions are fixed and do not depend on each other, so an article can quote the exit cycles of either machine.',
      ],
    },

    useWhen: [
      'The reader has come away believing that pipelining makes each instruction run faster, and the article has to take that apart — both machines stamp every instruction with the same five-cycle stay while their trays fill at different times.',
      'The article defines latency and throughput as separate quantities and needs one picture in which the first holds still while the second changes.',
      'The prose explains that a program speeds up because results arrive more often, not because any result arrives sooner — the first result appears at the same cycle on both machines.',
    ],

    avoidWhen: [
      'The article wants the total cycle formula for N instructions or how the gain approaches the stage count as N grows. Five instructions are fixed here.',
      'The subject is memory latency, cache misses or network round trips. Every stage here takes exactly one cycle and no memory access is modelled.',
      'The article argues that pipelining makes each instruction slower through register overhead. That cost is set to zero here, so both machines show equal stays.',
      'The subject is stalls or dependent instructions. None of the five waits on another.',
    ],

    contrastWith: [
      {
        concept: 'fiveStagePipeline',
        note: 'That measures the total gain for a given number of instructions and why it stays under the stage count; this isolates which of the two quantities the gain belongs to.',
      },
      {
        concept: 'stageOverlap',
        note: 'That is the mechanism — several instructions sharing the stages at once; this is its consequence for time, separating what the mechanism changes from what it leaves alone.',
      },
      {
        concept: 'latencyLadder',
        note: 'Both are about latency, but that is the delay of reaching a level of memory, which a single access pays in full; here latency is the fixed number of stages an instruction must pass, which overlap cannot hide either.',
      },
      {
        concept: 'simd',
        note: 'Both raise throughput without shortening the work on any one item — pipelining by staggering instructions through stages, vector lanes by applying one instruction to many values side by side.',
      },
    ],
  },
};

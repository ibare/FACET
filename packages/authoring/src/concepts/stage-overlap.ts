/**
 * stageOverlap 개념 선언.
 *
 * canonical facet 은 `facet:stageOverlap` — 세로로 선 다섯 칸의 관(IF 가 위, WB 가
 * 아래)에 명령어 넷을 흘리는 화면이다. 박자마다 관 속 명령어가 모두 한 칸씩 내려가고
 * 비워진 IF 로 줄 맨 앞의 명령어가 내려앉는다. 넷이 사이클 8 에 다 끝나고, 하나씩
 * 했다면 스물이었다는 한 줄로 닫는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 재생 막대만 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 주어 층위 가르기: 이 개념의 주어는 **한 박자 안의 움직임** 이다 — 누가 어디로 옮기고
 * 어느 칸이 비고 누가 들어오는가. 총 박자 수 · 빨라진 비율(fiveStagePipeline) 이나
 * 한 명령어가 걸리는 시간 · 처리율(throughputNotLatency) 은 주어로 세우지 않았다.
 *
 * 어휘 배타: definition 에 cycles · speedup · fill · drain · latency · throughput 을
 * 넣지 않았다. 시간 낱말은 "clock" 하나로만 말한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const stageOverlapConcept: FacetConceptSource = {
  id: 'stageOverlap',
  label: 'Stage Overlap (Each Clock, Everyone Moves Down One Stage)',
  canonicalFacet: 'facet:stageOverlap',

  surface: {
    definition:
      'The per-clock motion inside a pipeline: on every clock each instruction in flight advances one stage and the fetch slot it vacates admits the next, so different instructions occupy different stages at once.',
    exemplarKeywords: [
      'overlapping instruction execution',
      'instructions in flight',
      'next instruction enters before the previous finishes',
      'assembly line analogy',
      'laundry analogy for pipelining',
      'each stage works on a different instruction',
      'advance one stage per clock',
      'fetch the next instruction while decoding this one',
      'instruction-level parallelism by overlap',
      'pipeline occupancy',
    ],
  },

  briefing: {
    observable: [
      'The pipeline is drawn as a vertical tube of five cells, IF at the top and WB at the bottom; four instructions (add, sub, and, or) wait in a queue above it and the tube starts empty.',
      'On each cycle every instruction in the tube drops one cell together, the IF cell at the top is left free, and the front of the queue settles into it while the queue closes up by one place.',
      'An instruction that finishes WB falls out of the bottom of the tube into a done row, pushing the ones that finished earlier aside, and is tagged with the cycle it finished.',
      'Busy cells are shaded and a count reads how many of the five stages are busy; at cycles 4 and 5 four of the five cells hold an instruction at the same moment.',
      'Once the queue is empty the caption says nothing is left to fetch and the IF cell stays empty while the rest keep moving down.',
      'The closing caption states that all four finished by cycle 8 and that one at a time they would have taken 20 cycles.',
    ],

    screen: {
      affordances: [
        'The screen plays the four instructions through the tube on its own and stops once the last one has left.',
        'Under it sit a Replay button and a playback strip. Dragging the strip handle back to cycle 4 or 5 is how a reader can hold the moment when four stages are working at once.',
        'The four instructions are fixed and independent of each other, so an article can name which instruction sits in which stage at a given cycle.',
      ],
    },

    useWhen: [
      'The article introduces pipelining with the assembly-line picture and the reader has to see that the second instruction starts while the first is still inside — the freed top cell being refilled on the very next cycle is that moment.',
      'The reader imagines a pipeline as something that holds one instruction and passes it along, and needs to see several different instructions sitting in different stages at the same instant.',
      'The prose explains that the stages are separate pieces of hardware, so the fetch unit would sit idle once its instruction moves on unless something new is put into it.',
    ],

    avoidWhen: [
      'The article is about the cycle count formula for many instructions or how close the gain comes to the number of stages. Only four instructions pass through, and only one total is stated at the end.',
      'The subject is instructions that wait on an earlier result, stalls or forwarding. None of the four reads another\'s result and nothing ever pauses.',
      'The article is about branches or fetching the wrong instructions. The four are fetched strictly in order.',
      'The subject is overlapping work across threads, cores or I/O — concurrency in general rather than inside one processor pipeline.',
    ],

    contrastWith: [
      {
        concept: 'fiveStagePipeline',
        note: 'This is the rule applied on each clock; the totals it adds up to over many instructions, and why those totals fall short of the stage count, are the other concept.',
      },
      {
        concept: 'throughputNotLatency',
        note: 'This shows that instructions share the stages at once; that one draws the consequence — instructions come out more often, but none of them gets through faster.',
      },
      {
        concept: 'pipelineBubble',
        note: 'Here every instruction moves down every clock; a bubble is what happens when one cannot, and an empty slot moves down in its place.',
      },
      {
        concept: 'dualIssue',
        note: 'Overlap puts one new instruction into the first stage each clock; dual issue widens that entry to two, so the gain comes from width rather than from depth.',
      },
    ],
  },
};

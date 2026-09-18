/**
 * dataHazard 개념 선언.
 *
 * canonical facet 은 `facet:dataHazard` — 서로 값을 주고받는 명령어 다섯 줄을 다섯 단계
 * 파이프라인에 흘리고, 손잡이로 대처 넷(안 기다림 · 기다림 · 포워딩 · 포워딩 + 순서 바꿈)
 * 을 갈아 끼우는 완제품. 같은 다섯 줄이 9 · 15 · 10 · 9 박자로 끝나고, 안 기다림만 옛 값을
 * 넷 읽어 결과 셋을 망친다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 셋이 저마다 한 대처의 한 장면을 독점한다 — 붙들림(readBeforeWrite), 옆길
 * (operandForwarding), 흘러가는 빈 칸(pipelineBubble). 그래서 이 definition 은 **주어를
 * 프로그램과 그 대처 전체로** 올리고, 조각의 대표 낱말(`held` · `bypass` · `latch` ·
 * `empty slot` · `load-use` · `decode`)을 한 번도 쓰지 않는다. 대신 이쪽만의 낱말은
 * `dependency` · `ignoring` · `reordering` · `wrong results` · `total cycle count` 다 —
 * 대처를 **나란히 놓고 값을 매기는** 말이다. 조각은 수를 비교하지 않고 한 장면만 말한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dataHazardConcept: FacetConceptSource = {
  id: 'dataHazard',
  label: 'Data Hazard (Four Ways to Handle a Dependency)',
  canonicalFacet: 'facet:dataHazard',

  surface: {
    definition:
      'The dependency where a later instruction needs a register an earlier one has not produced, and the responses to it — ignore, delay, pass early, reorder — weighed as total cycle count against wrong results.',
    exemplarKeywords: [
      'data hazard',
      'RAW hazard',
      'true dependency',
      'data dependency between instructions',
      'hazard handling in a pipelined CPU',
      'stall versus forwarding versus reordering',
      'instruction scheduling by the compiler',
      'compiler reorders instructions to avoid a stall',
      'why a pipeline without interlocks gives wrong answers',
      'CPI increase from dependencies',
      'MIPS five-stage pipeline hazards',
      'dependent instructions back to back',
    ],
  },

  briefing: {
    observable: [
      'Each of the five instructions is one row, and its five stage bands (IF, ID, EX, MEM, WB) sit on a shared cycle axis, so a delay shows as a band pushed to the right and a recovery as a band pulled back to the left.',
      'A delayed cycle is drawn as a dashed extension of the ID band for the instruction that waits, and of the IF band for the one behind it.',
      'Every source operand is traced back to the instruction that produces it, and the value crosses by one of two drawn routes — down through the register file on the right, or straight across between rows — with a legend naming both routes, the old-value read and the stall.',
      'Under No wait, old numbers are pulled out of the register file into the readers, and the result cells that depend on them are left showing the wrong number beside the right one; the run ends at 9 cycles with 4 old values read and 3 wrong results.',
      'Under Wait the same program stretches to 15 cycles with 6 stalls and no wrong results; under Forward it closes up to 10 cycles with a single stall left, right after the load.',
      'Under Reorder the row for add r7, r8, r9 physically moves up ahead of add r3, r1, r4 — the caption says it shares no register with them — and the last stall disappears: 9 cycles, the same as No wait, with every value correct.',
      'Three counters run alongside — Cycles, Stalls and Old values read — and are reset to zero whenever the handling changes, so each handling is scored from scratch.',
      'The closing caption states the cycles, the stalls and the number of wrong results for the handling just played.',
    ],

    screen: {
      affordances: [
        'Playback is fully controlled: play, single step, pause, reset, and a speed slider.',
        'A four-position control labelled Hazard handling — No wait, Wait, Forward, Reorder — is the handle the argument rests on; it starts on Wait.',
        'After a run finishes the screen waits on the final picture, and moving the handle replays the same five instructions under the new handling.',
        'The five instructions, the starting register values and the one memory word are fixed, so an article can quote the cycle counts 9, 15, 10 and 9 and name the registers that come out wrong.',
        'A code panel labelled Counting cycles and old reads starts empty with a "+ Add language" button; the code it offers computes the same cycle count and old-read count as the counters.',
      ],
    },

    useWhen: [
      'The article has to justify why real processors bother with extra hardware and compiler effort for dependent instructions, and the reader needs to see the alternatives priced against each other on one program rather than hear that one is better.',
      'The reader believes a faster finish is simply better; the handling that finishes in 9 cycles with three wrong registers, set next to the one that finishes in 9 cycles with none, is what separates speed from correctness.',
      'The prose claims that hardware alone cannot remove every delay after a load and that instruction order chosen by the compiler matters, and it needs one program where only a reordering closes the final gap.',
    ],

    avoidWhen: [
      'The subject is a race condition or data race between threads or processes sharing memory. Everything here is one instruction stream inside one processor.',
      'The article is about a hazard in digital logic — a glitch on a combinational output — or about hazards in the safety or risk sense.',
      'The subject is a branch and the instructions fetched after it. No instruction here changes where fetching goes.',
      'The article is about hardware that issues instructions out of program order on its own, with reservation stations or a reorder buffer. The only reordering here is a fixed program order chosen before the run.',
      'The subject is a dependency between iterations of a loop, or between tasks in a build or data-processing pipeline.',
      'The article is about the delay of a memory access through the cache hierarchy. The load here always takes the same fixed time.',
    ],

    contrastWith: [
      {
        concept: 'readBeforeWrite',
        note: 'That is the single fact behind the whole problem — a register read scheduled before the write it needs — settled by waiting; this weighs every way of responding to that fact against the others on one program.',
      },
      {
        concept: 'operandForwarding',
        note: 'That is one remedy taken on its own, a result reaching its consumer before the register file has it; this counts what the remedy wins back and the one delay it cannot remove.',
      },
      {
        concept: 'pipelineBubble',
        note: 'A bubble is the claim that the delay left after a load costs every later instruction one cycle; the data hazard claims that delay is a price to be weighed, and that only a change of instruction order removes it.',
      },
      {
        concept: 'fiveStagePipeline',
        note: 'The pipeline assumes each instruction can start before the previous one finishes; a data hazard is the case where that assumption breaks because the next instruction needs the previous result.',
      },
      {
        concept: 'controlHazard',
        note: 'Both break the one-per-cycle rhythm, but a data hazard is about when a value becomes available, while a control hazard is about not yet knowing which instruction comes next.',
      },
      {
        concept: 'outOfOrderExecution',
        note: 'Here reordering is a fixed decision made before the program runs; out-of-order execution makes that decision in hardware while the program runs, picking whichever instruction has its values ready.',
      },
    ],
  },
};

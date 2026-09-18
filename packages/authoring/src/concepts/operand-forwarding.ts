/**
 * operandForwarding 개념 선언.
 *
 * canonical facet 은 `facet:operandForwarding` — `add r1, r2, r3` 바로 뒤의
 * `sub r4, r1, r5`. 사이클 4 에 I1 이 EX 에서 낸 12 가 EX/MEM 단계 레지스터에서 짧은 호를
 * 타고 I2 의 EX 입구로 건너가고, 그때 레지스터 파일의 r1 은 아직 옛 값 3 이다. 멈춤 없이
 * 사이클 6 에 끝나고, 포워딩이 없었다면 8 이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 주어는 **값 하나가 지나는 길**이다. 기다림을 말하지 않고 (readBeforeWrite 의 `held` ·
 * `decode` · `lands` 를 쓰지 않는다), 적재나 빈 칸도 말하지 않는다 (pipelineBubble 의
 * `load` · `empty slot` 을 쓰지 않는다). 대처를 견주지도 않는다 (dataHazard 의
 * `reordering` · `wrong results` 를 쓰지 않는다). 이쪽의 낱말은 `bypass` · `latch` ·
 * `ALU input` · `register file still holds` 다.
 *
 * readBeforeWrite 와 마주 보는 짝 — 저쪽은 레지스터 파일이 옳아질 때까지 사이클을
 * 치르고, 이쪽은 레지스터 파일이 뒤처진 채로 두고 사이클을 잃지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const operandForwardingConcept: FacetConceptSource = {
  id: 'operandForwarding',
  label: 'Operand Forwarding (Bypassing the Register File)',
  canonicalFacet: 'facet:operandForwarding',

  surface: {
    definition:
      'A result goes from the execute-stage latch straight into the next instruction\'s ALU input, bypassing the register file, so no cycles are lost though the register file still holds the old value.',
    exemplarKeywords: [
      'forwarding',
      'bypassing',
      'bypass network',
      'operand bypass',
      'forwarding path from EX/MEM',
      'forwarding unit',
      'forwarding multiplexer in front of the ALU',
      'result forwarding',
      'register bypass',
      'back-to-back dependent ALU instructions without a stall',
    ],
  },

  briefing: {
    observable: [
      'Two instruction cards move one stage to the right each cycle; each card carries the two operand slots at its EX input and the result it produces.',
      'Beneath the stages sit the program list under IF and the register file under ID, and a long write-back route runs along the floor from WB back to the register file.',
      'In cycle 3, I2 reads r1 = 3 from the register file in ID — the old value — while I1 is computing 7 + 5 = 12 in EX.',
      'In cycle 4 the 12 crosses from the EX/MEM latch along a short arc straight into I2\'s EX input; the 3 it read earlier is displaced and left just beneath the slot with a line struck through it, and I2 computes 12 - 4 = 8.',
      'At that same moment the register file still shows r1 = 3, marked as the old value; the long route along the floor carries 12 back to r1 only in cycle 5.',
      'A cycle ruler at the bottom places an end marker at cycle 6, with a second marker labelled without forwarding pushed out to cycle 8.',
      'The closing caption gives the instruction count, zero stall cycles and the finishing cycle, then says how many more cycles I2 would have waited without forwarding.',
    ],

    screen: {
      affordances: [
        'The screen plays the two instructions through on its own and stops with both end markers on the ruler.',
        'A Replay button and a playback strip sit underneath. Dragging the strip to cycle 4 is how a reader can hold the moment the value is in flight while the register file still shows 3.',
        'The two instructions and the register values are fixed, so an article can quote the 12 that crosses over, the struck-out 3, and the finishing cycles 6 and 8.',
      ],
    },

    useWhen: [
      'The reader assumes a value only exists once it is written into a register, and has to accept that the next instruction can use it a full stage before that; the register file still showing 3 while 8 is already being computed is what breaks the assumption.',
      'The article introduces the forwarding path or forwarding multiplexers in a pipelined datapath and needs one concrete cycle to point at, with the source latch and the destination input both named.',
      'The prose needs a single number for what forwarding buys on a back-to-back dependency, and the two end markers at 6 and 8 supply it.',
    ],

    avoidWhen: [
      'The subject is port forwarding, packet forwarding in a router, email forwarding, or forwarding a function\'s arguments in a programming language.',
      'The article is about a dependency on a value coming from memory. Only an arithmetic result is passed on here, and it always arrives in time.',
      'The subject is comparing ways to handle dependent instructions against each other. One mechanism is shown in one case; nothing is compared except its own absence.',
      'The article is about register renaming or result broadcast to waiting instructions in an out-of-order core. The pipeline here runs strictly in order.',
      'The subject is a store buffer forwarding a pending store to a later load. The value here moves between arithmetic instructions, not through memory.',
    ],

    contrastWith: [
      {
        concept: 'readBeforeWrite',
        note: 'The mirrored answer to the same dependency: waiting pays cycles to keep reads going through a correct register file, forwarding lets the register file lag and pays no cycles.',
      },
      {
        concept: 'pipelineBubble',
        note: 'Forwarding removes the wait when a result exists at the end of execute; a bubble is what remains when the value only exists a stage later, so even the early path arrives too late.',
      },
      {
        concept: 'dataHazard',
        note: 'This is one remedy judged by itself; the data hazard is the whole problem with every remedy priced against the others, including where forwarding falls short.',
      },
      {
        concept: 'outOfOrderExecution',
        note: 'Forwarding shortens the wait between two instructions kept in order; out-of-order execution fills the wait by running something else instead.',
      },
      {
        concept: 'writeBackVsThrough',
        note: 'Both let a later reader get a value before its home copy is updated, but in a cache the home is main memory and the delay is a policy, while here the home is the register file and the gap lasts a single cycle.',
      },
    ],
  },
};

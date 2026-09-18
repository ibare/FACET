/**
 * readBeforeWrite 개념 선언.
 *
 * canonical facet 은 `facet:readBeforeWrite` — 포워딩 없는 다섯 단계 파이프라인에서
 * `sub r4, r1, r5` 가 `add r1, r2, r3` 의 r1 을 기다리며 ID 에 두 사이클 붙들리는 조각.
 * 사이클 5 앞 반에 12 가 r1 에 내려앉고 뒤 반에 붙들린 명령어가 그것을 읽고 풀려난다.
 * 일찍 읽었다면 r4 = −1 이었을 것이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 주어는 **읽는 명령어 하나와 두 시각(읽는 때 · 쓰는 때)** 이다. 대처를 비교하지 않고
 * (dataHazard 의 `reordering` · `wrong results` · `cycle count` 를 쓰지 않는다), 값이
 * 옆으로 건너가는 길도 말하지 않는다 (operandForwarding 의 `bypass` · `latch` 를 쓰지
 * 않는다). 이쪽의 낱말은 `decode` · `held` · `lands` · `read after write` 다.
 *
 * operandForwarding 과는 **마주 보는 짝**으로 꼬리를 엇갈렸다 — 이쪽은 레지스터
 * 파일이 옳은 값을 가질 때까지 기다려 사이클을 치르고, 저쪽은 레지스터 파일이 아직
 * 틀린 채로 두고 사이클을 되찾는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const readBeforeWriteConcept: FacetConceptSource = {
  id: 'readBeforeWrite',
  label: 'Read Before Write (Held Until the Value Lands)',
  canonicalFacet: 'facet:readBeforeWrite',

  surface: {
    definition:
      'An instruction reaches decode wanting a register the instruction just ahead has not yet written back, so it is held there until the write lands, trading cycles for a correct value.',
    exemplarKeywords: [
      'read after write',
      'RAW dependency',
      'read-after-write hazard',
      'pipeline interlock',
      'stall until the register is written',
      'instruction waits for the previous result',
      'operand not ready yet',
      'register written in the first half, read in the second half',
      'split-cycle register file',
      'without forwarding the pipeline must wait',
      'would have read the old value',
    ],
  },

  briefing: {
    observable: [
      'Three instruction cards move one stage cell to the right each cycle across IF, ID, EX, MEM and WB, with the register file drawn underneath.',
      'When sub r4, r1, r5 reaches ID it needs r1, which add r1, r2, r3 has not written yet; the card lurches forward and is dragged back into ID, and a "held" mark appears under it.',
      'While it is held, a tether joins the card to the r1 cell, and on the tether floats what reading now would give — read now: r4 = -1, computed from the old 3 in r1.',
      'The card behind it, or r6, r7, r8, stays in IF for as long as the held card stays in ID, and cells marked bubble enter EX in their place.',
      'In cycle 5 the value 12 drops out of WB into r1 first, and only then rises to the held card in ID — the caption spells it as first half write, second half read — and the tether is released.',
      'When the held instruction later writes back, the caption says it writes r4 ← 8, not -1, putting the right answer next to the one the early read would have produced.',
      'A cycle counter at the top names each cycle, and every step of the playback is exactly one cycle.',
    ],

    screen: {
      affordances: [
        'The screen plays the three instructions through on its own and stops once the last one has written back.',
        'A Replay button and a playback strip sit underneath. Dragging the strip back is how a reader can stop on the cycle where the card is held with the -1 floating on its tether.',
        'The program and the starting register values are fixed, so an article can quote r1 = 3 before, 12 after, and r4 = 8 against the -1 an early read would give.',
      ],
    },

    useWhen: [
      'The reader has pictured a pipeline as instructions simply marching one stage per cycle and has not yet noticed that a register is read two stages before the earlier instruction writes it; the held card with its would-be wrong answer is what makes the timing clash visible.',
      'The article needs to establish that waiting is the correct but costly default before any remedy is introduced, and wants the reader to see what the wait protects — the -1 that would otherwise have been computed.',
      'The prose mentions that register files are written in the first half of a cycle and read in the second, and needs the moment where that ordering lets the held instruction go one cycle sooner.',
    ],

    avoidWhen: [
      'The subject is a database or distributed-system consistency anomaly — dirty reads, read-your-writes, lost updates. This is about two instructions in one processor pipeline.',
      'The article is about a data race or memory ordering between threads. There is a single instruction stream here.',
      'The subject is how a result can be delivered early so that no wait is needed. The pipeline here has no such path, and the wait is the whole point.',
      'The article is about the empty cycles themselves and how they pass through to the end of the pipeline. The waiting instruction is the subject here, not what flows past it.',
      'The subject is a write-after-read or write-after-write dependency, or register renaming. Only a read that needs an earlier write is shown.',
    ],

    contrastWith: [
      {
        concept: 'operandForwarding',
        note: 'The mirrored answer to the same dependency: this waits until the register file holds the right value and pays in cycles, forwarding leaves the register file behind and pays nothing in cycles.',
      },
      {
        concept: 'pipelineBubble',
        note: 'Both concern a wait inside the pipeline, but this is about why the reading instruction cannot proceed, and a bubble is about the empty slot the wait releases and what it costs everything behind it.',
      },
      {
        concept: 'dataHazard',
        note: 'This is the underlying clash and the safe response to it; the data hazard as a whole is the choice among responses, including unsafe and faster ones, and their totals.',
      },
      {
        concept: 'stageOverlap',
        note: 'Overlap is what lets the next instruction start early; this is the point at which starting early would mean reading a value that does not exist yet.',
      },
      {
        concept: 'writePolicy',
        note: 'Both concern when a written value becomes visible to a later reader, but a cache write policy decides when memory sees it, and here the question is when the next instruction may read a register.',
      },
    ],
  },
};

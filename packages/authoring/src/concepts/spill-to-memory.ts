/**
 * spillToMemory 개념 선언.
 *
 * canonical facet 은 `facet:spillToMemory` — 할당 전 명령 열 여덟 줄에 레지스터 둘. L5 에서 빈 레지스터가 없어 마지막
 * 읽기가 가장 먼 `t3`(L7)가 `r1` 에서 스택 칸 `[sp+0]` 으로 밀려나고, L7 바로 앞에서 `r2` 로 되불려 온다. 명령 열은
 * 8 줄에서 10 줄이 된다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `registerAllocation` 은 레지스터 수를 돌려 밀어냄의 **수**를 견준다. 형제 `registersAreFew` 는 모자라지 않은
 * 장면, `interferenceGraph` 는 선을 긋는 장면이다. 이쪽은 **모자라는 한 순간** — 누구를 내보내고, 어디에 두고, 언제
 * 되찾는가. 그래서 definition 은 stack slot · store/load · farthest next use · 다른 레지스터로 돌아온다 쪽 낱말을 쥐고,
 * 레지스터 수와 명령 수의 관계(문턱)나 last read frees 는 넣지 않는다.
 *
 * 전제: 레지스터 둘은 예로 정한 수, 스택 칸 8 바이트, 명령은 가상 레지스터 기계의 교과서 표기다. "가장 늦게 다시 쓰일
 * 값" 을 고르는 것은 선형 훑기의 흔한 규칙이고 동률은 번호가 작은 값이다 — 실제 컴파일러는 반복문 안의 쓰임 같은 비용도 잰다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const spillToMemoryConcept: FacetConceptSource = {
  id: 'spillToMemory',
  label: 'Spilling a Value to a Stack Slot',
  canonicalFacet: 'facet:spillToMemory',

  surface: {
    definition:
      'When every register is occupied, the compiler stores the value needed farthest ahead to a stack slot and loads it back right before its next use, possibly into another register.',
    exemplarKeywords: [
      'register spill',
      'spilling',
      'spill and reload',
      'spill slot',
      'stack slot [sp+0]',
      'store to stack then load back',
      'which value to spill',
      'furthest next use',
      'Belady farthest-use heuristic',
      'out of registers',
    ],
  },

  briefing: {
    observable: [
      'Eight instruction lines with temporaries: `load t1, a`, `load t2, b`, `mul t3, t1, t2`, `load t4, c`, `load t5, d`, `sub t6, t4, t5`, `add t7, t3, t6`, `store x, t7`. Two registers `r1` · `r2` sit top right, "Stack slots (memory)" below. Each value chip carries the line of its last read ("last read: L7").',
      'Lines L1 to L4 seat values normally; at L3 `t1` and `t2` are read for the last time and `t3` takes the freed `r1`.',
      'At L5 there is no free register for `t5`. The last reads are compared — `t3` L7, `t4` L6, `t5` L6 — and the caption reads "no free register for t5. Read last: t3 (L7) → [sp+0], then r1 → t5." A `store [sp+0], r1` line marked "spill" is inserted just before L5 and the lines below shift down.',
      'Just before L7 the caption reads "Before L7: t3 is read here, so [sp+0] → r2." A `load r2, [sp+0]` line marked "reload" is inserted. `t3` left `r1` and comes back in `r2` — the same value in a different register.',
      'The run takes ten steps and ends with the list grown from 8 to 10 lines: "Lines: 8 → 10 · memory trips: 2 · most live at once: 3, registers: 2". The final list is `load r1, a` · `load r2, b` · `mul r1, r1, r2` · `load r2, c` · `store [sp+0], r1` · `load r1, d` · `sub r1, r2, r1` · `load r2, [sp+0]` · `add r1, r2, r1` · `store x, r1`.',
      'The instructions are textbook notation for an imaginary register machine; two registers and 8-byte stack slots are chosen for the example. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one line per step plus one step for the reload, and stops after L8.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to L5 holds the comparison of last reads and the `store` line appearing.',
        'The program and the two registers are fixed, so an article can quote the ten-line result exactly.',
      ],
    },

    useWhen: [
      'The article explains what a compiler does when a value has nowhere to go, and needs the concrete store before the crowded line and the load before the later use.',
      'A reader asks why compiled code contains stores and loads to the stack that the source never wrote, and the article wants one case where exactly two such lines appear and why.',
    ],

    avoidWhen: [
      'The subject is operating-system swapping or paging of memory to disk. The move here is from a register to a stack slot inside one block of compiled code.',
      'The article compares several register counts or asks how many registers remove all spills. Only two registers and one spill are shown.',
      'The point is cache eviction policies. The choice of which value to spill resembles them but happens at compile time on values, not cache lines.',
    ],

    contrastWith: [
      {
        concept: 'registerAllocation',
        note: 'A single spill is a local decision: which value leaves, where it waits, and where it returns. Register allocation aggregates those decisions and asks at what register count they stop being needed.',
      },
      {
        concept: 'registersAreFew',
        note: 'Freeing a register on a value\'s last read suffices as long as live values never outnumber the registers; spilling is what the compiler does at the first line where they do.',
      },
      {
        concept: 'evictLeastRecent',
        note: 'Both push something out of a small fast store. Least-recently-used eviction looks backward at past use; this spill choice looks forward to the next use, which a compiler can see in the code.',
      },
    ],
  },
};

/**
 * registersAreFew 개념 선언.
 *
 * canonical facet 은 `facet:registersAreFew` — 할당 전 명령 열 열 줄(값 `t1` … `t9`)에 레지스터 셋을 준다. 값은 마지막으로
 * 읽히는 순간 제 레지스터를 비우고, 바로 다음에 생기는 값이 가장 낮은 번호의 빈 레지스터에 앉는다. 산 값은 많아야 셋이라
 * 끝까지 모자라지 않고, 명령도 10 줄 그대로다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `registerAllocation` 은 레지스터 수를 돌려 끼어드는 줄의 수를 견준다. 형제 조각 `spillToMemory` 는 모자랄 때
 * 값이 메모리로 가는 장면, `interferenceGraph` 는 나눠 쓸 수 없는 둘을 선으로 긋는 장면이다. 이쪽은 **모자라지 않은**
 * 장면 하나 — 값 아홉이 레지스터 셋에 들고 나는 까닭은 산 값만 자리를 차지하기 때문이다. 그래서 definition 은 마지막
 * 읽기 · 비운다 · 재사용 · 동시에 산 값 쪽 낱말을 쥐고, spill · stack · edge · 레지스터 수를 돌린다는 말을 넣지 않는다.
 *
 * 전제: 레지스터 셋은 예로 정한 수, 명령은 가상 레지스터 기계의 교과서 표기, 명령 열은 갈래 없는 곧은 한 토막이다.
 * 산 구간은 정의한 줄 바로 뒤부터 마지막으로 읽는 줄까지다 — 마지막 읽기 줄에서 정의되는 값은 같은 레지스터를 이어 쓴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const registersAreFewConcept: FacetConceptSource = {
  id: 'registersAreFew',
  label: 'Nine Values in Three Registers (Freed on Last Read)',
  canonicalFacet: 'facet:registersAreFew',

  surface: {
    definition:
      'A value holds its register only while it is live: at its last read the register is freed and the next value defined takes it, so nine temporaries fit in three registers.',
    exemplarKeywords: [
      'live range',
      'liveness',
      'register reuse',
      'last use frees the register',
      'temporaries share registers',
      'virtual registers to physical registers',
      'why three registers are enough',
      'three-address code',
      'register assignment by hand',
    ],
  },

  briefing: {
    observable: [
      'Ten instruction lines L1 to L10 are written with temporaries: `load t1, a`, `load t2, b`, `load t3, c`, `mul t4, t2, t3`, `add t5, t1, t4`, `load t6, d`, `load t7, e`, `sub t8, t6, t7`, `mul t9, t5, t8`, `store x, t9`. The start caption reads "Values: 9 · Registers: 3".',
      'Three register seats `r1` · `r2` · `r3` sit in the middle, each with a "Sat here before" row; below, a strip titled "Live values after each line" grows by one bar per line.',
      'One step is one line. Steps 1–3 seat `t1`, `t2`, `t3` in `r1`, `r2`, `r3` ("L1: new value t1 sits in r1, the lowest-numbered free register").',
      'At L4 `mul t4, t2, t3` reads `t2` and `t3` for the last time: both registers empty and `t4` sits in `r2`, so the line becomes `mul r2, r2, r3` — read and overwritten in the same register.',
      'The same pattern repeats: `t5` takes `r1` at L5, `t6` and `t7` fill `r2` and `r3`, `t8` takes `r2`, `t9` takes `r1`, and L10 `store x, r1` empties everything. The live count after each line runs 1 · 2 · 3 · 2 · 1 · 2 · 3 · 2 · 1 · 0.',
      'The run ends "Most live at once: 3 · Registers: 3 · Instructions: 10 → 10". Over the run `r1` held `t1` · `t5` · `t9`, `r2` held `t2` · `t4` · `t6` · `t8`, and `r3` held `t3` · `t7`.',
      'The instructions are textbook notation for an imaginary register machine; three registers is a number chosen for the example. A value counts as live from just after the line defining it to the line that reads it last. The screen does not footnote either point.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one instruction line per step, and stops after L10.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to L4 holds the moment `t2` and `t3` leave and `t4` takes the freed `r2`.',
        'The program and the three registers are fixed, so an article can quote each line and each register exactly as shown.',
      ],
    },

    useWhen: [
      'A reader assumes a program needs one register per variable or temporary, and the article must show that only values alive at the same moment compete for a register.',
      'The article introduces live ranges and wants a concrete case where a register is handed on at the exact line its old value is read for the last time.',
    ],

    avoidWhen: [
      'The article is about what happens when registers run out. There is always a free register here; nothing is sent to memory.',
      'The subject is the CPU\'s own register file, register renaming or out-of-order hardware. The assignment here is done by the compiler before anything runs.',
      'The reader is meant to change the register count and compare outcomes. The count is fixed at three.',
    ],

    contrastWith: [
      {
        concept: 'registerAllocation',
        note: 'Freeing a register on a value\'s last read is the mechanism that makes a small register set enough; the allocation question is what happens to the instruction count when even that reuse runs short.',
      },
      {
        concept: 'spillToMemory',
        note: 'Both hand registers between values, but this claim holds when the live values never outnumber the registers; spilling is the answer for the moment they do.',
      },
      {
        concept: 'interferenceGraph',
        note: 'Sequential reuse of a freed register is decided line by line going forward. An interference graph records the same facts as pairs that may never share, so they can be settled all at once.',
      },
    ],
  },
};

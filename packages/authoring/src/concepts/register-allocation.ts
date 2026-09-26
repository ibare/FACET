/**
 * registerAllocation 개념 선언.
 *
 * canonical facet 은 `facet:registerAllocation` — 원시 식 `x = (a + b) * (c - d) - e * f` 를 낮춘 할당 전 명령 열
 * 열두 줄(`t1` … `t11`)에 선형 훑기 할당기가 레지스터를 매긴다. 손잡이 K(2 · 3 · 4 · 5, 처음 3)를 돌리면 끼어든 줄이
 * 10 · 4 · 0 · 0, 명령 수가 22 · 16 · 12 · 12 로 갈린다. 산 값의 가장 큰 수 4 = 간섭 그래프의 색 4 가 문턱이다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 비운 자리에 다음 값이 앉는다(`registersAreFew`) · 넘치면 스택 칸으로 밀렸다 되불려
 * 온다(`spillToMemory`) · 거꾸로 훑으며 같이 산 둘을 선으로 묶는다(`interferenceGraph`). 이쪽은 **레지스터 수를
 * 돌렸을 때 명령 수가 어떻게 갈리는가**를 맡는다. 그래서 definition 은 레지스터 수 · 끼어든 명령의 수 · 문턱(가장 많이
 * 동시에 산 값) 쪽 낱말을 쥐고, 조각들이 독점한 last read frees · farthest next use · stack slot · backward scan ·
 * edge 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `registerAllocation.md` 가 밝힌 것):
 *  - 선형 훑기의 한 방식(가장 늦게 쓰일 값을 밀어낸다)이다. 실제 할당기는 그래프를 칠하거나 비용을 따로 잰다.
 *  - K 2~5 는 예로 정한 값이다(실제 범용 레지스터는 대개 16~32). 스택 칸 8 바이트.
 *  - 명령은 특정 CPU 가 아닌 가상 레지스터 기계의 교과서 표기다.
 *  - 코드 패널은 명령 열이 아니라 할당기(IR → 여섯 언어)다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const registerAllocationConcept: FacetConceptSource = {
  id: 'registerAllocation',
  label: 'Register Allocation (Register Count vs Inserted Instructions)',
  canonicalFacet: 'facet:registerAllocation',

  surface: {
    definition:
      'How the number of machine registers decides how many extra spill and reload instructions an allocator must insert: the overhead shrinks as registers are added and reaches zero once the count covers the peak of simultaneously live values.',
    exemplarKeywords: [
      'register allocation',
      'linear scan register allocation',
      'register pressure',
      'how many registers does this expression need',
      'spill code overhead',
      'MaxLive',
      'chromatic number equals max live',
      'Chaitin',
      'LLVM register allocator',
      'GCC reload',
      'compiler back end',
      'code generation',
    ],
  },

  briefing: {
    observable: [
      'An instruction list of twelve lines, L1 to L12, lowered from `x = (a + b) * (c - d) - e * f`, still written with temporaries: `load t1, a` … `sub t11, t10, t9` · `store x, t11`. Beside each line a dot shows how many values are live after it; a dashed vertical line marks the register count K. Register cells `r1` … and a Stack slots area sit to the side, and an interference graph with 17 edges and "Colors: 4" stands in the lower right.',
      'Each step handles one line: the line\'s value drops into the lowest-numbered free register and the line\'s text is rewritten with register names ("L1: t1 → r1"). A value read for the last time frees its register ("Freed: …").',
      'When no register is free the caption reads "L4: no free register. Last reads: …" and names the value to spill; a `store [sp+0], r1` line marked "spill" is inserted above the line and pushes the rest down. Before a line that reads a spilled value, a `load r3, [sp+0]` line marked "reload" is inserted ("Before L6: reload [sp+0] → r3 (t1)"). A reloaded value can come back in a different register — at K = 3, `t1` leaves `r1` and returns in `r3`.',
      'At the default K = 3 the round has 15 steps and ends "Result. Instructions: 16 · inserted: 4" — two spills and two reloads.',
      'Across the handle: K = 2 gives 5 spills, 5 reloads, 22 instructions; K = 3 gives 16; K = 4 and K = 5 both give 12 with nothing inserted, and K = 5 produces exactly the same instructions as K = 4, never touching `r5`.',
      'The live count peaks at 4 (after L4 and after L8), shown as "Max live: 4" on the threshold; the interference graph is the same 17 edges and 4 colours for every K, so the handle only moves the register count across that fixed threshold.',
      'Readouts under the controls: "Inserted lines" and "Instructions" counted so far in the round, and "Max live", which is 4 from the first step.',
      'The instructions are textbook notation for an imaginary register machine, not any real CPU; K values 2 to 5 are chosen for the example, while real machines have about 16 to 32 general registers. The allocator is one linear-scan policy — spill the value whose last read is farthest, ties to the earlier-defined value. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a four-position "Registers" slider (2, 3, 4, 5), starting at 3. Each round starts again from the twelve original lines, collapsing lines inserted in the previous round, and then waits for the handle.',
        'The move that makes the idea land is stepping K from 2 up to 5: inserted lines fall 10 → 4 → 0 → 0, and once K passes the "Max live: 4" mark, adding a register changes nothing.',
        'The code panel, labelled "Allocator", starts empty with a "+ Add language" button; the chosen language shows the compiler function that assigns registers from arrays of value numbers, not the instruction list itself. It means the same across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article asks how many registers an expression really needs and wants the answer shown as a count: below the peak of live values extra memory instructions appear, at the peak they vanish, above it nothing improves.',
      'A reader wonders why register-starved targets produce longer machine code for the same source, and the article wants the instruction count set against the register count on one expression.',
    ],

    avoidWhen: [
      'The article is about graph-colouring allocators, coalescing or Chaitin-Briggs simplification. The allocator here is a linear scan; the graph is shown only for its colour count.',
      'The subject is registers saved across function calls, calling conventions or context switches. There is one straight-line block and no call.',
      'The point is CPU pipeline hazards between instructions that use the same register. Nothing here executes; only the compiler\'s assignment is shown.',
    ],

    contrastWith: [
      {
        concept: 'registersAreFew',
        note: 'Reusing a register once its value is dead explains why a few registers go a long way; the allocation question is what that reuse fails to cover when the register count drops below the live peak, and what it costs.',
      },
      {
        concept: 'spillToMemory',
        note: 'A spill is one decision about one value at one line. Allocation counts those decisions across register counts and asks where the count reaches zero.',
      },
      {
        concept: 'interferenceGraph',
        note: 'Building the graph establishes which values may share a register and how many colours they need; the allocation claim uses that colour count as the register budget above which no extra instructions appear.',
      },
      {
        concept: 'instructionSelection',
        note: 'Choosing instructions fixes how many temporaries exist and how many are live together; register allocation takes that list as given and pays for any excess over the register count.',
      },
      {
        concept: 'dataHazard',
        note: 'A data hazard is a run-time conflict between instructions reading and writing a register in a pipeline. Allocation is the earlier, compile-time choice of which register each value gets.',
      },
    ],
  },
};

/**
 * interferenceGraph 개념 선언.
 *
 * canonical facet 은 `facet:interferenceGraph` — 할당 전 명령 열 일곱 줄(값 `t1` … `t6`)을 끝에서 앞으로 한 줄씩 거슬러
 * 훑는다. 줄이 값을 정의하는 순간 그 값은 그 줄 뒤에 살아 있던 값 모두와 선으로 묶인다(선 6). 다 훑은 뒤 정의 차례로
 * 칠해 레지스터 셋에 값 여섯이 나뉜다. `t2` 의 마지막 읽기(L4)에서 `t4` 가 정의되므로 둘 사이에 선이 없고 `r2` 를 나눈다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `registerAllocation` 은 다 그은 그래프의 색 수를 레지스터 수의 문턱으로만 쓴다. 형제 `registersAreFew` ·
 * `spillToMemory` 는 앞으로 훑으며 자리를 주고 뺏는 장면이다. 이쪽은 **거꾸로 훑어 선을 긋고, 선이 없는 둘이 같은
 * 레지스터를 받는** 장면이다. 그래서 definition 은 backward · edge · neighbours · colouring 쪽 낱말을 쥐고, free ·
 * spill · 레지스터 수를 돌린다는 말을 넣지 않는다.
 *
 * 전제: 곧은 한 토막(갈래 없음), 레지스터 수에 한도 없음(필요한 만큼 r1 · r2 …), 칠하는 차례는 정의 차례 · 가장 낮은 번호 —
 * 실제 할당기는 차수가 작은 값부터 떼어 내며 차례를 정한다. 명령은 가상 레지스터 기계의 교과서 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const interferenceGraphConcept: FacetConceptSource = {
  id: 'interferenceGraph',
  label: 'Interference Graph (Backward Scan, Then Colour)',
  canonicalFacet: 'facet:interferenceGraph',

  surface: {
    definition:
      'Scanning a straight-line block backward, each definition gets an edge to every other value live after that line; colouring the resulting graph gives edge-joined values different registers while unjoined values may share one.',
    exemplarKeywords: [
      'interference graph',
      'liveness analysis backward',
      'live-out set',
      'graph coloring register allocation',
      'greedy coloring',
      'Chaitin',
      'values that cannot share a register',
      'k-colorable',
      'register interference',
    ],
  },

  briefing: {
    observable: [
      'Seven instruction lines with temporaries: `load t1, a`, `load t2, b`, `load t3, c`, `add t4, t1, t2`, `mul t5, t4, t3`, `sub t6, t5, t1`, `store x, t6`. Value nodes `t1` … `t6` stand on the right with "Edges: 0".',
      'The scan starts below the last line — "Scan from the end, one line up at a time. Nothing is live after L7." — and each step moves the scan line up by one. The values live at that gap ride on the scan line as chips.',
      'When a line defines a value, its chip leaves the group for its node and draws one edge to each value still live beside it ("L4 defines t4. One new edge to each value live beside it: t1, t3."). Values the line reads rise out of the instruction text and join the group.',
      'Over steps 1–7 the edges appear in this order: `t1–t5`; `t1–t4` · `t3–t4`; `t1–t3` · `t2–t3`; `t1–t2`. L7, L6 and L1 draw none. Six edges in total; `t1` has four neighbours, `t6` none.',
      '`t2` is read for the last time at L4, the same line that defines `t4`. When the scan passes L4 `t2` is not yet in the group, so no `t2–t4` edge is drawn.',
      'Steps 8–13 colour the values in definition order, each taking the lowest register its coloured neighbours do not hold ("t4: colored neighbors hold t1 r1 · t3 r3. Lowest free: r2."): `t1` r1, `t2` r2, `t3` r3, `t4` r2, `t5` r2, `t6` r1. The run ends "Values: 6 · Registers used: 3" — `r2` shared by `t2`, `t4`, `t5`.',
      'The block has no jumps or branches, there is no limit on registers, and the colouring order is simply definition order. The instructions are textbook notation for an imaginary register machine. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself: seven scan steps from L7 up to L1, then six colouring steps, and stops.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to L4 holds the moment `t4` joins `t1` and `t3` but not `t2`.',
        'The program is fixed, so an article can quote every edge and every colour as shown.',
      ],
    },

    useWhen: [
      'The article introduces interference graphs and needs to show where the edges come from: a definition joined to whatever is live after it, found by walking the code backward.',
      'A reader asks why two values that both appear in one instruction can still end up in the same register, and the article wants the boundary case where a value dies on the line that defines the next.',
    ],

    avoidWhen: [
      'The article is about running out of registers, spilling or simplification with a fixed colour budget. The registers here are unlimited and nothing is spilled.',
      'The subject is graph colouring in general, map colouring or scheduling. The graph here is built from one block of code and coloured greedily once.',
      'The code has loops or branches and liveness must be merged across blocks. This is a single straight block.',
    ],

    contrastWith: [
      {
        concept: 'registerAllocation',
        note: 'Constructing the graph answers which values may share a register. Allocation takes the graph\'s colour count as given and asks what a register budget below it costs.',
      },
      {
        concept: 'registersAreFew',
        note: 'Both rest on the same live ranges. Forward reuse hands a freed register to the next value as it goes; the graph records every incompatible pair first and assigns registers afterwards.',
      },
      {
        concept: 'twoColorConflict',
        note: 'An odd cycle forcing a third colour is a fact about graphs in general. In register allocation the graph itself is the product: its edges are derived from which values are alive at once in a program.',
      },
    ],
  },
};

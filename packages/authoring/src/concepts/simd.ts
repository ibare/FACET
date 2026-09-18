/**
 * simd 개념 선언.
 *
 * canonical facet 은 `facet:simd` — 원소 열여덟의 c = a + b 를 차선 1 · 2 · 4 · 8 로
 * 갈아 끼우며 덧셈 명령 수를 세는 완결형이다. 차선을 넓힐수록 묶음은 반씩 줄지만
 * 나누어떨어지지 않고 남은 꼬리는 줄지 않아, 빨라짐이 ×2 → ×1.5 → ×1.5 로 꺾인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 *   이 개념        **고를 수 있는 폭**과 그 값. 넓힐 때마다 무엇이 반으로 줄고 무엇이
 *                  그대로 남는가 — 꼬리 · 빨라짐 · 배수.
 *   lanesInStep    **명령 하나가 하는 일**. 같은 박자에 스칼라 명령 하나와 벡터 명령
 *                  하나를 나란히 놓고, 결과는 같고 칸 수만 다르다는 주장.
 *
 * 그래서 definition 에서 이쪽은 "instruction · scalar · register" 를 쓰지 않고, 저쪽은
 * "add · leftover · speedup · doubling" 을 쓰지 않는다. "SIMD 란 무엇인가" 어휘는
 * 조각이 갖고, 여기는 벡터화한 반복문의 꼬리 처리 · 폭 확장 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const simdConcept: FacetConceptSource = {
  id: 'simd',
  label: 'SIMD (Lane Count and the Leftover Tail)',
  canonicalFacet: 'facet:simd',

  surface: {
    definition:
      'Choosing how many lanes a SIMD loop uses: each doubling halves the full groups, but leftover elements that fill no group still cost one add apiece, so the speedup lags behind the width.',
    exemplarKeywords: [
      'loop vectorization',
      'auto-vectorization',
      'vector width',
      'remainder loop',
      'epilogue loop',
      'tail handling in vectorized code',
      'masked tail',
      'array length not a multiple of the vector width',
      'padding data to a multiple of the lane count',
      'AVX-512 versus AVX2 speedup',
      'diminishing returns from wider vectors',
      'how much faster is SIMD',
    ],
  },

  briefing: {
    observable: [
      'Three rows hold a, b and c for eighteen elements. Behind them lie coloured bands, one band per add instruction, each as wide as the current lane count; the leftover elements get bands one cell wide with a dashed outline.',
      'Turning the lane handle makes the bands stretch and merge with their neighbours, and at 4 and 8 lanes a one-cell tail grows out of the end — two elements that no group can take.',
      'During playback a register frame travels along the bands. Over a full group it jumps the whole width at once and every sum in it drops into c together; over the tail the frame shrinks to one cell and crawls element by element.',
      'Below the elements a time row turns each band into a single cell, so a band that was w cells wide in space becomes one cell in time. A dashed outline marks the length of the one-lane run, eighteen, for comparison.',
      'The counts fall 18, 9, 6, 4 across 1, 2, 4 and 8 lanes. From 1 to 2 the row halves exactly; from 4 to 8 it only goes from 6 to 4, because the packed part halves while the two tail adds stay put.',
      'Metrics for add instructions, tail adds and speedup percent restart from zero on each round, and the closing caption states the total adds, the element count and the percentage of one-lane speed — 100, 200, 300, 450.',
      'The code panel highlights the phase being run — planning the round, the grouped add, the tail add, and the speedup.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A Lanes control with 1, 2, 4 and 8, starting at 1, is the handle that carries the argument. A round finishes and waits; changing the handle mid-round abandons that round at the next step and replays all eighteen elements under the new width.',
        'The eighteen operand pairs are fixed, so an article can quote the exact counts and percentages for each width.',
        'The code panel starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article promises that twice the vector width means twice the speed. Moving from 4 to 8 lanes and watching the count drop only from 6 to 4 is the correction, and it needs the reader to turn the handle themselves.',
      'The prose has to explain why vectorized code carries a separate cleanup loop, or why data is padded out to a multiple of the width — the leftover elements that crawl one at a time are the reason, and their share of the work grows as the width grows.',
      'The reader needs space and time tied together: a group that spans several cells in the data occupies one cell of the instruction count, and the screen folds one into the other directly under it.',
    ],

    avoidWhen: [
      'The subject is memory bandwidth or whether loads can keep up with wide arithmetic. Loads and stores are treated as part of each add and are not counted.',
      'The article is about running work on several cores, threads, or GPU warps. Everything here is one instruction stream.',
      'The point is several different instructions leaving in the same cycle — superscalar or out-of-order issue. The parallelism here lives inside a single operation.',
      'The subject is alignment requirements for vector loads, or shuffles, gathers and horizontal reductions. Only an element-wise add is performed.',
      'The article is about masking inside a loop body to handle branches. The tail here is always finished one element at a time.',
      'The article uses "lane" for a road lane, a swim lane in a diagram, or a network lane.',
    ],

    contrastWith: [
      {
        concept: 'lanesInStep',
        note: 'That one fixes the width and asserts what a single wide operation achieves against a one-element operation; this one makes the width the variable and asks where its gains run out.',
      },
      {
        concept: 'dualIssue',
        note: 'Two different ways to do more per cycle: dual issue sends two distinct instructions together when they do not depend on each other, while here one operation is applied to many elements and independence among them is given.',
      },
      {
        concept: 'structAlignment',
        note: 'Both answer a boundary the hardware imposes: alignment inserts gaps inside a record so each field starts where the hardware expects it, while here the boundary is the group width and the elements that do not fill a last group are finished one at a time.',
      },
      {
        concept: 'prefetching',
        note: 'Opposite ends of a vector loop: prefetching is about getting the data to the processor before it is needed, this is about how much arithmetic each operation does once it arrives.',
      },
    ],
  },
};

/**
 * lanesInStep 개념 선언.
 *
 * canonical facet 은 `facet:lanesInStep` — 같은 c = a + b 를 위의 스칼라와 아래의 SIMD
 * (차선 넷) 가 한 박자씩 함께 셈한다. 원소 여덟이라 SIMD 는 명령 둘로 끝내고, 스칼라는
 * 여덟 번째 박자까지 제 걸음을 간다. 끝에 두 쪽의 c 가 같다고 적는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 스크럽 띠만 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (완제품 `simd` 와)
 *
 * 이쪽은 **명령 하나가 하는 일**, 저쪽은 **폭을 고르는 값**이다. 폭이 넷으로 고정되고
 * 여덟이 넷으로 나누어떨어져 꼬리가 없으므로, definition 에 "add · leftover · speedup ·
 * doubling" 을 쓰지 않는다. 대신 "scalar · instruction · register · identical result"
 * 를 이쪽이 독점한다. "SIMD 란 무엇인가" 류 입문 어휘와 명령어 집합 이름도 이쪽에 둔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lanesInStepConcept: FacetConceptSource = {
  id: 'lanesInStep',
  label: 'Lanes in Step (One Instruction, Several Elements)',
  canonicalFacet: 'facet:lanesInStep',

  surface: {
    definition:
      'One vector instruction set against one scalar instruction in the same beat: the scalar produces a single sum while the vector instruction fills four packed register slots, and both finish with identical results.',
    exemplarKeywords: [
      'what is SIMD',
      'single instruction multiple data',
      'vector instruction',
      'vector register',
      'scalar versus vector',
      'SSE',
      'AVX',
      'NEON',
      'four 32-bit integers in a 128-bit register',
      'data-level parallelism',
      'packed arithmetic',
      'fewer instructions for the same work',
    ],
  },

  briefing: {
    observable: [
      'Two panels stand one above the other, scalar on top and SIMD with four lanes below, each laying out a, b and c as a column sum — a over b, a rule, then c.',
      'One instruction is one bar coming down. The scalar bar is one column wide; the SIMD bar covers four columns, and the four lanes are drawn inside a single register outline.',
      'Both bars descend on the same clock, so in the same interval the top panel fills one cell of c and the bottom panel fills four. Copies of the a and b values slide down into c and the sum appears; the originals stay where they were.',
      'Each panel keeps its own instruction count with a row of tick marks beside its name, so the two counts grow side by side at different rates.',
      'After two beats the SIMD side has nothing left and the caption says so, while the scalar side keeps adding one column per beat until its eighth instruction.',
      'The closing caption states that c is the same on both sides and gives the counts, eight instructions against two.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole run on its own and stops on the closing comparison.',
        'Under it sit a Replay button and a playback strip. Dragging the strip back to an early beat is how a reader can hold the moment where one bar has filled one cell and the other four.',
        'The eight operand pairs and the four-lane width are fixed, so an article can name the exact columns each instruction covers.',
      ],
    },

    useWhen: [
      'The reader is meeting SIMD for the first time and needs to see what "one instruction, multiple data" means before anything about speed — two bars on one clock, one covering a column and the other four.',
      'The article has to establish that the vector version computes exactly what the element-by-element version computes, and differs only in how many instructions it takes to get there.',
      'The prose explains that a wide register holds several values side by side and that the operation applies to all of them at once, and wants the register outline around four lanes to point at.',
    ],

    avoidWhen: [
      'The subject is how the gain changes as the width grows, or what happens to elements left over when the length is not a multiple of the width. The width here never moves and eight divides evenly by four.',
      'The article is about several different instructions issuing in one cycle, pipelining, or out-of-order execution. The two panels are two ways of doing one job, not two instructions sharing a machine.',
      'The subject is multithreading, multiple cores, or GPU programming.',
      'The point is memory traffic — loads, stores, bandwidth, or cache behaviour. Only the additions are shown.',
      'The article uses "lane" for a road lane, a swim lane, or a network lane.',
    ],

    contrastWith: [
      {
        concept: 'simd',
        note: 'This asserts what one wide operation achieves at a fixed width; that one holds that the width is a choice whose return diminishes, because elements left over after the last full group gain nothing from a wider operation.',
      },
      {
        concept: 'dualIssue',
        note: 'Parallelism at two different levels: there two separate instructions leave together when neither needs the other\'s result, here a single instruction carries several elements and there is nothing to check between them.',
      },
      {
        concept: 'bitwiseOps',
        note: 'The same idea at a finer grain: a bitwise operation applies one rule to every bit of a word at once, while a vector instruction applies one arithmetic operation to every element packed in a register.',
      },
    ],
  },
};

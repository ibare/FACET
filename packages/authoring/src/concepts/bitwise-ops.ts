/**
 * bitwiseOps 개념 선언.
 *
 * canonical facet 은 `facet:bitwiseOps` — 같은 두 바이트(214 · 124)에 규칙만 갈아
 * 끼우며 여섯 연산을 도는 완결형이다. 손잡이가 논증을 진다: 규칙이 바뀌면 결과가
 * 84 · 254 · 170 · 41 · 172 · 107 로 전부 달라지는데, 자리 하나만 떼어 놓고 보면
 * 규칙은 언제나 한 줄짜리다.
 *
 * 코드 패널이 비트 연산자를 한 글자도 쓰지 않고 `% 2` · `// 2` 산술로 펴는 것은
 * IR 의 한계를 메운 우회가 아니라 주장 그 자체다 — `applyRule` 이 이웃을 인자로
 * 받지조차 않는 것이 곧 "자리마다 독립적" 이라는 말이다 (irs.ts 머리 주석).
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 셋이 모두 비트를 다루므로 definition 의 주어를 넷 다 달리 세웠다.
 *
 *   이 개념    **규칙 자체**. 자리마다 혼자, 그러나 한꺼번에. 시프트만이 예외다.
 *   bitMask    **자리를 고르는 일**. 필요한 자리만 남고 나머지가 0 으로 덮인다.
 *              남은 자리는 제자리에 선다.
 *   bitShift   **자리를 옮기는 일**. 옮기면 무게가 배가 되고 반이 된다. 비트는
 *              값을 지닌 채 자리를 바꾼다.
 *   byteOrder  **바이트를 늘어놓는 차례**. 뒤집히는 것은 차례이지 비트가 아니다.
 *
 * 그래서 여기 keywords 는 **연산자 어휘**(& | ^ ~ · 진리표 · 한꺼번에 · 두 정수를
 * 자리마다 엮는 일)를 갖고, 마스크 · 시프트 · 엔디언 어휘는 조각 셋에 넘긴다.
 *
 * avoidWhen 이 막아야 하는 것: definition 에 "bit" 가 있는 한 비트셋 · 블룸 필터 ·
 * 해시 글이 반드시 걸린다. 형제 `twosComplement` · `positionalValue` ·
 * `negateAndAddOne` 이 이미 "per-bit operations or moving bits sideways — AND, OR,
 * XOR, shifts, masks" 를 밀어내고 있으므로 이쪽에서도 마주 민다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bitwiseOpsConcept: FacetConceptSource = {
  id: 'bitwiseOps',
  label: 'Bitwise Operations (Each Place on Its Own)',
  domain: 'computer-architecture',
  canonicalFacet: 'facet:bitwiseOps',

  surface: {
    definition:
      'Integer operations in which every bit position applies one short rule alone and at the same moment — AND, OR, XOR, NOT — with shifting the sole case where a position takes its value from a neighbour.',
    exemplarKeywords: [
      'bitwise operators',
      'AND, OR, XOR, NOT',
      'the & | ^ ~ operators',
      'what XOR does to two numbers',
      'a truth table for a single bit',
      'combining two integers position by position',
      'every position decided at the same instant',
      'why bitwise operations cost so little',
      'NOT ignores the second operand',
      'the same two bytes under six different rules',
      'operating on a whole word at once',
      'bit-level operators in C and Java',
    ],
  },

  briefing: {
    observable: [
      'Three rows stand in one grid of eight columns — the operand a on top, a middle band, and the result at the bottom — and each row carries its decimal value at the right edge, so a change of rule is legible as a change of one number.',
      'The middle band is what distinguishes the rules from one another: for AND, OR and XOR it holds the second operand b; for NOT it collapses to a column of 0↔1 marks with connectors running straight down; for the two shifts the connectors fan over by exactly one column.',
      'A focus outline descends the grid one column at a time and cuts through all three rows at once. Under a shift the upper outline sits one cell off from the lower one, and that single misalignment is the whole of what makes shifting different from the other four.',
      'On a shift, dashed outlines appear just outside the grid: the incoming 0 stands there from the first frame, while the departing bit only appears as it falls, sliding further out and fading.',
      'The result row begins as eight empty muted cells and fills one at a time; the decimal at its right end is a running total, so the number assembles rather than appearing at the end.',
      'A rule line above the caption states the rule in one sentence and changes with the handle — "Both bits 1 → 1.", "The two bits differ → 1.", "Every place reads its right neighbour."',
      'The caption names the reading and the writing separately: "Place 3: reading 1 and 1." then "Place 3 gets 1."; under a shift it says which other place was read instead, or that there was no neighbour to read and a 0 came in.',
      'Two counters sit with the controls. They drop to 0 the instant the rule is changed and climb again as places are filled: AND ends at 3 bits on and 2 changed, while NOT ends with all 8 marked changed.',
      'The operands never move — a is 11010110 and b is 01111100 — and the six rules land on 84, 254, 170, 41, 172 and 107, so the numbers can be quoted exactly.',
      'The code in the panel contains no bitwise operator at all: it reaches a bit with % 2 and drops a place with // 2. The function that decides a position takes only that position\'s two bits and no neighbour, and the one function that looks sideways does nothing but choose which place to read from.',
      'Once a language pane has been added, the panel highlights the line matching the running stage — building the place weights, reading a digit, applying the rule, placing the result, finishing.',
    ],

    screen: {
      affordances: [
        'A six-way operation control marked AND, OR, XOR, NOT, ≪ 1 and ≫ 1, starting on AND. It is the handle that carries the argument: pressing a segment rebuilds the board under the new rule with the same two operands, and it is picked up mid-run as well as at rest.',
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'When a run finishes the board holds, and it stays there until the operation control is moved again.',
        'Two counters read out beside the controls, one for the bits standing at 1 in the result and one for the places where the result differs from a.',
        'The code panel starts empty with an "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; two panes can sit side by side.',
      ],
    },

    useWhen: [
      'The article treats these operators as a list to be memorised — a table of four truth tables — and the reader has no reason why they belong together. Running all of them over one unchanged pair of bytes makes the family visible as one shape with six settings.',
      'The prose needs "the whole word is decided at once" to be load-bearing before an argument about speed or about flag words rests on it, and the reader pictures a loop over eight positions instead. The screen walks the places for legibility while the rule line states that no place consults another.',
      'A reader is about to meet an expression mixing several of these operators and would benefit from having seen that each one is separately trivial, so the difficulty of the expression is composition rather than any single rule.',
      'The article claims that shifting belongs with these operators and also that it is unlike them. Both halves are on screen at once: shifting is driven by the same control and the same grid, and it is the only setting where the focus outlines stop lining up.',
      'The prose wants to argue that an operator can be understood without a circuit diagram — the code panel derives all six from ordinary division and remainder, so nothing is left resting on hardware the reader has to take on faith.',
    ],

    avoidWhen: [
      'The article is about a bit set, a bitmap or a bit array standing in for a set of booleans over a large universe — a Bloom filter\'s array, a bitmap index, a visited-set. Those spread across many words and are addressed by computing a position; here a single pair of bytes is combined with a second pair.',
      'The subject is a hash function, or any mixing step that happens to be written with these operators. Their role there is to scatter a value, and nothing here composes two operations or runs one more than once.',
      'The point is selecting or clearing particular positions with a chosen constant — keeping a field, testing a flag, turning a bit off. Both operands here are ordinary data and neither is chosen to act on the other.',
      'The subject is what moving bits sideways does to the value — doubling, halving, packing a field into place. Shifting appears here as one member of a family, and the argument being made about it is that it is the exception rather than what it is good for.',
      'The article is about how a written pattern should be read — which reading applies, what the top place weighs, how many places were declared. No rule here consults any of that; the same operation is applied whatever the pattern is taken to mean.',
      'The subject is writing a value in another base or reading hexadecimal. Every number on screen is decimal or a row of bits.',
      'The article is about a result that outgrew its container. One shift does discard a bit at the edge, but that is a property of that one rule and not a computation going wrong.',
      'The subject is the order bytes take in memory or on a wire. Nothing here concerns addresses, and no rule moves a bit out of the value it belongs to.',
      'The article is about how a gate or an adder is built. These operations are performed here, not constructed, and the code derives them from arithmetic rather than from hardware.',
      'The article uses "mask", "flag" or "signal" in their ordinary non-numeric senses.',
    ],

    contrastWith: [
      {
        concept: 'bitMask',
        note: 'Here the operator is the subject and both operands are ordinary data; there one operand is chosen in advance so that the result answers a question about the other. That is a use of AND rather than a property of it, and the choosing is the whole of the idea.',
      },
      {
        concept: 'bitShift',
        note: 'Four of these rules let a position ignore its neighbours completely, and shifting is the one that does not. This concept is about that asymmetry existing; that one is about what the exception buys — a change in the size of the number rather than in any individual bit.',
      },
      {
        concept: 'byteOrder',
        note: 'Both concern how a value is arranged, but no rule here moves a bit out of the place it occupies, and that one changes no bit\'s value at all — only which address holds which part. One is indifferent to memory; the other exists only because of it.',
      },
      {
        concept: 'twosComplement',
        note: 'These rules never ask what a pattern denotes — the same operation is applied whether the top place is read as positive or negative — while that one is precisely the agreement that settles the question. An operator that consulted it would not be a per-position rule any more.',
      },
      {
        concept: 'positionalValue',
        note: 'Both take a row of bits as their material, but that one only regroups a row to write the same number a second way, whereas every rule here produces a number different from the ones it was given.',
      },
    ],
  },
};

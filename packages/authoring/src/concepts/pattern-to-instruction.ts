/**
 * patternToInstruction 개념 선언.
 *
 * canonical facet 은 `facet:patternToInstruction` — `let y = list[2] + n * 4` 를 낮춘 마디 열 개 IR 나무를 무늬 여덟으로
 * 덮는다. 위에서부터 마디마다 맞는 무늬 가운데 가장 큰 것을 고르고(고르기 여섯), 다 덮은 뒤 아래 조각부터 명령 한 줄씩
 * 낸다(내기 여섯). `load-offset` 이 MEM · ADD · NUM 16 세 마디를 한꺼번에 삼킨다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `instructionSelection` 은 명령 모음과 식을 바꿔 명령 수가 갈리는 것을 본다. 이쪽은 **한 나무를 덮는 절차** —
 * 위에서 고르고, 큰 무늬가 여러 마디를 삼키고, 아래부터 낸다. 그래서 definition 은 maximal munch · top-down · swallows ·
 * bottom-up emit 쪽 낱말을 쥐고, instruction set 을 바꾼다거나 target machine 을 견준다는 말을 넣지 않는다.
 *
 * 전제: 명령은 가상 레지스터 기계의 교과서 표기, `t1` … 는 레지스터 할당 전 임시 이름, 무늬 여덟과 칸 8 바이트는 예로
 * 정한 값이다. 가장 큰 무늬 먼저는 가장 적은 명령을 늘 보장하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const patternToInstructionConcept: FacetConceptSource = {
  id: 'patternToInstruction',
  label: 'Maximal Munch: One Tile Swallows Several Nodes',
  canonicalFacet: 'facet:patternToInstruction',

  surface: {
    definition:
      'Maximal munch walks an IR tree top-down, at each node taking the largest tile that fits so one instruction swallows several nodes, then emits the tiles\' instructions bottom-up because operands must exist first.',
    exemplarKeywords: [
      'maximal munch',
      'tree tiling',
      'largest pattern first',
      'one instruction covers several nodes',
      'emit order post-order',
      'IR tree to assembly',
      'load with offset [t1+16]',
      'Appel Modern Compiler Implementation',
      'greedy instruction selection',
    ],
  },

  briefing: {
    observable: [
      'An "IR tree" of ten nodes for `let y = list[2] + n * 4`: STORE with NAME y and an ADD, which adds MEM(ADD(NAME list, NUM 16)) to MUL(NAME n, NUM 4). A "Tiles, largest first" list shows eight tiles sorted by size — `load-offset` 3; `store`, `addi`, `muli` 2; `load-mem`, `add`, `mul`, `load-name` 1.',
      'The start caption reads "Start at the root. At each node, try the largest tile first and take the first one that fits." Steps 1–6 place one tile each, from the root downward: `store` on STORE (2 nodes), `add` on the upper ADD, `load-offset` on MEM (3 nodes), `load-name` on NAME list, `muli` on MUL (2 nodes), `load-name` on NAME n.',
      'Where a larger tile was tried and failed the caption says so: at the upper ADD, `addi` does not fit because the right child is a MUL, not a number, so `add` covers one node. At MEM the ADD below has `NUM 16` on its right, so `load-offset` swallows all three nodes.',
      'Steps 7–12 emit one line per tile, lowest tiles first, into the "Instructions" list: `load t1, list` · `load t2, [t1+16]` · `load t3, n` · `mul t4, t3, 4` · `add t5, t2, t4` · `store y, t5`. The root tile comes out last: "Nodes: 10 · Instructions: 6".',
      'Counters "Nodes covered: 10 of 10", "Tiles placed: 6" and "Instructions out: 6" end the run; the tile sizes add up 2+1+3+1+2+1 = 10 with no gaps or overlaps. The order of choosing (top-down) and the order of emitting (bottom-up) differ.',
      'The instructions are textbook notation for an imaginary register machine, `t1` … are temporaries before register allocation, and the eight tiles and 8-byte elements are chosen for the example. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself — six choosing steps, then six emitting steps — and stops after `store y, t5`.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to step 3 holds `load-offset` covering MEM, ADD and NUM 16 at once.',
        'The tree and the tile list are fixed, so an article can quote every tile and every emitted line exactly.',
      ],
    },

    useWhen: [
      'A reader assumes each IR node becomes one machine instruction, and the article needs a tree where ten nodes produce six instructions and one of them absorbs three nodes.',
      'The article explains why instructions are emitted in a different order than tiles are chosen: choosing goes from the root down, emitting waits until operands below have been computed.',
    ],

    avoidWhen: [
      'The article compares instruction sets or different machines. Only one tile list is used here.',
      'The subject is how the IR tree is built from source or parsing. The tree is given.',
      'The point is optimal, cost-minimal tiling. The rule shown is greedy — largest first.',
    ],

    contrastWith: [
      {
        concept: 'instructionSelection',
        note: 'The covering procedure is the same; the broader claim is that which instructions a machine offers, and the shape of the tree, decide how many instructions result.',
      },
      {
        concept: 'lowerToSimpler',
        note: 'Lowering breaks source constructs into more, simpler operations. Tiling goes the other way on the IR tree, packing several operations into one machine instruction.',
      },
      {
        concept: 'treeDropsSyntax',
        note: 'Both work on trees, but that one is about which source details a syntax tree keeps; here the tree is already compiler IR and is being consumed to produce instructions.',
      },
    ],
  },
};

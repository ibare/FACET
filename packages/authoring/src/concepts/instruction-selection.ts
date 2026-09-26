/**
 * instructionSelection 개념 선언.
 *
 * canonical facet 은 `facet:instructionSelection` — 원시 줄 `let y = list[2] + n * 4`(또는 `list[i] + n * 4`)를 낮춘
 * IR 나무를 무늬 아홉으로 덮는다(가장 큰 무늬 먼저). 손잡이 둘 — 명령 모음(기본 · + 즉시값 · + 주소 더하기, 처음 기본) ·
 * 식(처음 `list[2]`). `list[2]` 에서는 명령이 9 · 7 · 6 으로 줄지만, `list[i]` 에서는 `+ 주소 더하기` 를 켜도 9 그대로다 —
 * 큰 명령은 나무의 모양이 맞을 때만 덮는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `patternToInstruction` 은 한 모음으로 한 나무를 위에서 고르고 아래부터 내는 장면이다. 이쪽은 **기계가 가진 명령
 * 목록과 나무의 모양을 바꿨을 때 명령 수가 어떻게 갈리는가**를 맡는다. 그래서 definition 은 instruction set · target
 * machine · 같은 식 · 명령 수 · shape 쪽 낱말을 쥐고, 조각이 독점한 maximal munch · top-down · bottom-up · swallows 를
 * 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `instructionSelection.md` 가 밝힌 것):
 *  - 세 모음은 견주려고 예로 정한 가상 기계다. 실제 CPU 는 거의 다 즉시값과 주소 더하기를 가진다.
 *  - 가장 큰 무늬 먼저는 가장 짧은 열을 늘 보장하지 않는다(동적 계획법으로 고르는 방식이 따로 있다). 칸 하나 8 바이트.
 *  - 코드 패널은 나무가 아니라 나무를 덮는 컴파일러 함수(IR → 여섯 언어)다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const instructionSelectionConcept: FacetConceptSource = {
  id: 'instructionSelection',
  label: 'Instruction Selection (Instruction Set vs Instruction Count)',
  canonicalFacet: 'facet:instructionSelection',

  surface: {
    definition:
      'How the target machine\'s instruction set changes the number of instructions one IR tree compiles to: richer instructions cover more of the tree at once, but only where the tree has the shape they require.',
    exemplarKeywords: [
      'instruction selection',
      'tree pattern matching',
      'tiling the IR tree',
      'addressing modes',
      'immediate operands',
      'base plus offset addressing',
      'CISC vs RISC instruction count',
      'LLVM SelectionDAG',
      'GCC machine description',
      'retargetable code generator',
      'compiler back end',
    ],
  },

  briefing: {
    observable: [
      'An IR tree, lowered from the source line shown above it (`let y = list[2] + n * 4`), stands on the left: STORE · NAME y · ADD · MEM · ADD · NAME list · NUM 16 · MUL · NAME n · NUM 4, captioned "Uncovered tree · nodes: 10". `list[2]` reads `list` plus 16 because one element is 8 bytes.',
      'A "Patterns" table lists nine tiles with the tree shape each matches, the instruction it emits and how many nodes it "Covers": `store` STORE(NAME x, e) 2 · `load-offset` MEM(ADD(e, k)) 3 · `load-mem` MEM(e) 1 · `addi` ADD(e, k) 2 · `muli` MUL(e, k) 2 · `add` · `mul` · `load-name` · `li` 1 each. Tiles outside the current instruction set are left out of the search.',
      'Each step lands one tile on the tree, largest fitting tile first; the caption tracks "covered: 2 / 10" and so on. On the last step the covered pieces emit their instructions into the "Instructions" list, lower pieces first, and the caption reads "Instructions: 9 · temporaries: 8 · max live: 3".',
      'With "Basic" every tile covers one node, so even `NUM 16` is loaded with `li` and added: 9 instructions. "+ immediates" merges `ADD` + `NUM 16` into `addi` and `MUL` + `NUM 4` into `mul t5, t4, 4`: 7 instructions. "+ address offset" lets `load t2, [t1+16]` swallow MEM · ADD · NUM 16 together: 6 instructions.',
      'Switching the expression to `list[i] + n * 4` grows a `MUL(NAME i, NUM 8)` branch (12 nodes). The ADD under MEM no longer has a number on its right, so `load-offset` is marked as not fitting and `load-mem` lands instead; with "+ address offset" the count stays 9, the same as "+ immediates".',
      'Readouts under the controls: "Patterns" landed so far, and "Instructions" and "Max live values", which fill in on the emit step. Max live drops from 3 with "Basic" to 2 with the wider sets.',
      'The three instruction sets are imaginary machines chosen for comparison — real CPUs nearly all have immediates and address offsets — and largest-tile-first does not always yield the shortest code; cost-based dynamic programming is another method. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a three-position "Instruction set" slider (Basic, + immediates, + address offset), starting at Basic, and a two-position "Expression" slider (`list[2] + n * 4`, `list[i] + n * 4`), starting at the first. Each round starts from the uncovered tree and waits for a handle at the end.',
        'The move that makes the idea land is widening the instruction set on `list[2]` (9 → 7 → 6), then switching to `list[i]` and seeing the last widening buy nothing.',
        'The code panel, labelled "Maximal munch — biggest pattern first", starts empty with a "+ Add language" button; the chosen language shows the compiler function that covers the tree, not the source line. It means the same across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why the same source line compiles to a different number of instructions on different targets, and needs one tree covered under three instruction sets.',
      'A reader expects a powerful addressing mode always to be used, and the article must show that a variable index changes the tree so the big instruction no longer applies.',
    ],

    avoidWhen: [
      'The article is about CPU microarchitecture, micro-ops or instruction timing. Only the count of instructions chosen by the compiler is compared.',
      'The subject is optimal tiling by dynamic programming or cost models. The rule here is always the largest tile that fits.',
      'The point is lowering source code into IR. The tree is given already built; only covering it with instructions is shown.',
    ],

    contrastWith: [
      {
        concept: 'patternToInstruction',
        note: 'The covering rule — largest tile first, emit from the bottom up — is one procedure on one tree. The selection claim is about how the result changes as the available instructions and the tree\'s shape change.',
      },
      {
        concept: 'registerAllocation',
        note: 'Instruction selection decides which instructions and temporaries exist; register allocation comes after and places those temporaries into a limited set of registers.',
      },
      {
        concept: 'lowerToSimpler',
        note: 'Lowering turns source constructs into simpler IR. Selection starts from that IR and turns it into the particular instructions one machine offers.',
      },
    ],
  },
};

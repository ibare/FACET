/**
 * basicBlock 개념 선언.
 *
 * canonical facet 은 `facet:basicBlock` — 이른 `return` 이 있는 프로그램을 낮춘 세 주소 코드 여덟 줄에 리더 규칙 셋을 하나씩 대고
 * (① 첫 명령 줄 1 · ② 뜀의 목적지 줄 6 · ③ 뜀 · return 바로 다음 줄 5 · 6), 리더 줄 1 · 5 · 6 앞에서 잘라 블록 셋(명령 4 · 1 · 3)을
 * 만든다. 5 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * `flowGraphs`(완제품)는 흐름 꼴을 바꾸면 블록 · 간선 · 사슬이 함께 갈리는 대비를 쥔다. `edgesAreJumps` 는 블록 사이의 선을 쥔다.
 * 이쪽은 **어디서 자르나** — 리더 규칙 셋과 한 입구 한 출구 — 만 쥔다. 그래서 definition 은 leader · first instruction · jump target ·
 * after a jump or return · entered only at the top 을 쥐고, edge · successor · fall-through · chain 을 쓰지 않는다.
 *
 * 전제: `@notation native` 교과서 세 주소 코드. 뜀은 `goto` · `ifnot`. 코드를 돌리지 않는다. 아무도 뛰어오지 않는 라벨은 리더가 아니다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const basicBlockConcept: FacetConceptSource = {
  id: 'basicBlock',
  label: 'Cutting Code Into Basic Blocks at Leaders',
  canonicalFacet: 'facet:basicBlock',

  surface: {
    definition:
      'Three-address code is cut into basic blocks in front of every leader — the first instruction, any jump target, and any instruction right after a jump or return — so each block is entered only at its top and left only at its bottom.',
    exemplarKeywords: [
      'basic block',
      'leader algorithm',
      'partition into basic blocks',
      'single entry single exit',
      'straight-line code segment',
      'jump target',
      'instruction after a branch',
      'basic block boundaries',
      'dragon book leaders',
    ],
  },

  briefing: {
    observable: [
      'The source `let y = x * 2`, `let z = y + 3`, `if z > 10` / `return z`, `y = y + z`, `y = y * 2`, `return y` is lowered to eight instructions in one unbroken strip: `y = x * 2`, `z = y + 3`, `t1 = z > 10`, `ifnot t1 goto L1`, `return z`, `L1: y = y + z`, `y = y * 2`, `return y`. `ifnot` jumps to `L1` when the test is false and flows down when it is true.',
      'Each rule is applied across the whole code in one step. Rule 1, "the first instruction is a leader": line 1. Rule 2, "a line that some jump lands on": line 6, which line 4 jumps to.',
      'Rule 3, "the line right after a jump or return": line 5 (after the `ifnot`) and line 6 (after `return z`). Line 6 matches both rules 2 and 3 but is one leader.',
      'The last step cuts in front of leaders 1, 5 and 6, and three blocks fall apart: B1 lines 1–4 (four instructions), B2 line 5 (one), B3 lines 6–8 (three). Five steps including step 0.',
      'Line 5 has no label and nobody jumps to it, yet it is a leader because the `ifnot` above can fall through into it. Line 3 computes the condition but is not a leader — the branch is made by the jump on line 4, so both stay in B1.',
      'The arrow beside each block shows flow inside it, from top to bottom; how blocks connect to one another is not drawn. The code is never run — `x` has no value. The notation is textbook three-address code.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one rule per step, and stops after the cut.',
        'A Replay button and a playback strip sit below it. Holding the strip on rule 3 shows line 6 marked "Already a leader".',
        'The code is fixed, so every leader line and block size can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article defines a basic block and needs the leader rules applied to real instructions rather than stated in the abstract.',
      'A reader thinks a block boundary appears only at labels, and the article needs line 5, unlabelled yet a leader because it follows a conditional jump.',
    ],

    avoidWhen: [
      'The article is about how blocks connect or which block runs next. Connections between blocks are not shown.',
      'The subject is blocks in the source language, such as braces or indentation. These are blocks of low-level instructions.',
      'The article is about blocks in a blockchain or file system. This is compiler terminology.',
    ],

    contrastWith: [
      {
        concept: 'edgesAreJumps',
        note: 'Leaders decide where the cuts go; the last instruction of each resulting block decides which blocks follow it.',
      },
      {
        concept: 'flowGraphs',
        note: 'Cutting at leaders is a local procedure over one instruction list. How the leaders move when the same statements are wrapped in a different control structure is the question at the level of the whole graph.',
      },
      {
        concept: 'lowerToSimpler',
        note: 'Lowering produces the flat list of instructions and labels; finding leaders is the next pass, which only reads that list.',
      },
    ],
  },
};
